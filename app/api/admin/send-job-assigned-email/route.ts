import { NextRequest, NextResponse } from 'next/server';
import { SendTemplatedEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { PinpointSMSVoiceV2Client, SendTextMessageCommand } from '@aws-sdk/client-pinpoint-sms-voice-v2';
import { authorizeIamRequest } from '@/lib/server/authorizeIamRequest';
import { customOutputs } from '@/lib/amplifyOutputsCustom';
import { APP_DOMAIN } from '@/lib/publicAppConfig';
import { activeStops } from '@/lib/loadChange';
import { listAll } from '@/lib/listAll';
import { recordAudit } from '@/lib/auditLog';
import type { IamDataClient } from '@/lib/server/iamDataClient';
import { australianMobile, maskedMobile } from '@/lib/operatorMobile';
import { notifyOperatorText } from '@/lib/notifyOperatorText';
import { NO_MOBILE_REASON, type ChannelResult } from '@/lib/notifyOperatorOutcome';

const region = process.env.AWS_REGION || 'ap-southeast-2';
const sesClient = new SESClient({ region });
const smsClient = new PinpointSMSVoiceV2Client({ region });

/**
 * The SMS account is shared by every branch, so only production texts any
 * Operator; every other branch texts only the numbers in SMS_TEST_NUMBERS
 * (docs/adr/0010-notify-operator-texts-from-a-registered-sender-name.md). That
 * list comes from the build environment, not amplify_outputs.json, which is
 * served to browsers.
 */
function isTextableHere(international: string): boolean {
  if (customOutputs.branchName === 'main') return true;
  return (process.env.SMS_TEST_NUMBERS || '')
    .split(',')
    .some((raw) => australianMobile(raw)?.international === international);
}

function sanitizeNamePart(value: string, fallback: string) {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

// process.env.AWS_BRANCH/AMPLIFY_BRANCH aren't set in the SSR runtime, so this
// reconstruction is a last-resort fallback -- see lib/amplifyOutputsCustom.ts.
const branchName = sanitizeNamePart(process.env.AWS_BRANCH || process.env.AMPLIFY_BRANCH || '', '');
const fallbackJobAssignedTemplateName = branchName
  ? `NullDeviceJobAssignedTemplate-${branchName}`
  : 'NullDeviceJobAssignedTemplate';
const jobAssignedTemplateName =
  process.env.SES_JOB_ASSIGNED_TEMPLATE_NAME ||
  customOutputs.sesJobAssignedTemplateName ||
  fallbackJobAssignedTemplateName;
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeIamRequest(request, 'administrator');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { client } = auth;

    const body = await request.json();
    const { routeId } = body;

    if (!routeId) {
      return NextResponse.json({ error: 'routeId is required' }, { status: 400 });
    }

    const { data: route, errors: routeErrors } = await client.models.Route.get({ id: routeId });
    if (routeErrors || !route) {
      console.error('Route fetch errors:', routeErrors);
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    if (!route.assignedOperatorEmail) {
      return NextResponse.json({ error: 'Route has no assigned operator email' }, { status: 400 });
    }

    // Must use the IAM-authenticated client here -- this SSR request has no
    // signed-in Amplify session, so the plain data client (lib/data-client.ts)
    // throws NoValidAuthTokens (see lib/server/iamDataClient.ts for why).
    const customerResult = await client.models.Customer.get({ id: route.customerId });
    const customer = customerResult.data as { name?: string | null } | null;

    const { data: stops } = await listAll(client, 'Stop', { filter: { routeId: { eq: routeId } } });

    const configuredLogoUrl = process.env.SES_EMAIL_LOGO_URL?.trim();
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
    const resolvedAppBaseUrl = (appBaseUrl || `https://${APP_DOMAIN}`).replace(/\/$/, '');
    const logoUrl = configuredLogoUrl ? configuredLogoUrl : `${resolvedAppBaseUrl}/logo.svg`;

    const templateData = {
      operatorName: route.assignedOperatorName || 'there',
      routeCode: route.routeCode || route.id,
      customerName: customer?.name || 'a customer',
      stopCount: String(activeStops(stops).length),
      routeUrl: `${resolvedAppBaseUrl}/operator/routes/detail?id=${routeId}`,
      logoUrl,
      year: `${new Date().getUTCFullYear()}`,
    };

    const senderEmail = process.env.SES_SENDER_EMAIL || `no-reply@${APP_DOMAIN}`;

    let email: ChannelResult;
    try {
      const result = await sesClient.send(
        new SendTemplatedEmailCommand({
          Source: senderEmail,
          Destination: { ToAddresses: [route.assignedOperatorEmail] },
          Template: jobAssignedTemplateName,
          TemplateData: JSON.stringify(templateData),
        })
      );
      email = { status: 'sent', to: route.assignedOperatorEmail };
      console.log(`Job-assigned email sent to ${route.assignedOperatorEmail}, MessageId: ${result.MessageId}`);
    } catch (err) {
      console.error('SES send failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      email = { status: 'failed', reason: `Email not sent: ${errorMessage}` };
    }

    const text = await textOperator(client, {
      operatorSub: route.assignedOperatorSub,
      body: notifyOperatorText({
        routeCode: route.routeCode || route.id,
        customerName: customer?.name || '',
        stopCount: stops.length,
        scheduledDate: route.scheduledDate,
        routeLink: `${resolvedAppBaseUrl}/r/${routeId}`,
      }),
    });

    const sent = [email, text.result].some((channel) => channel.status === 'sent');
    const audit = await recordAudit(client, {
      actor: auth.claims.sub,
      customerId: route.customerId,
      eventType: 'data_access',
      resource: { type: 'route', id: route.id },
      action: 'route.notify_operator',
      ...(sent ? {} : { failure: 'Neither the email nor the text was sent' }),
      details: {
        operatorSub: route.assignedOperatorSub ?? null,
        email: { status: email.status, to: route.assignedOperatorEmail, ...('reason' in email ? { reason: email.reason } : {}) },
        text: { ...text.result, ...(text.mobile ? { to: text.mobile } : {}) },
      },
    });
    if (!audit.ok) console.error('Notify Operator audit entry not written:', audit.errors);

    if (!sent) {
      const reasons = [email, text.result].map((channel) => ('reason' in channel ? `${channel.reason}.` : ''));
      return NextResponse.json({ error: reasons.join(' ').trim(), email, text: text.result }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      sentTo: email.status === 'sent' ? route.assignedOperatorEmail : undefined,
      routeCode: route.routeCode,
      email,
      text: text.result,
    });
  } catch (err) {
    console.error('Unexpected error in send-job-assigned-email:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Internal server error: ${errorMessage}` }, { status: 500 });
  }
}

/**
 * Texts the Route's assigned Operator when they have an Australian mobile and
 * this site may text it. `mobile` is the masked number, for the audit entry.
 */
async function textOperator(
  client: IamDataClient,
  { operatorSub, body }: { operatorSub?: string | null; body: string }
): Promise<{ result: ChannelResult; mobile?: string }> {
  const { data: operator } = operatorSub
    ? await client.models.Operator.get({ id: operatorSub })
    : { data: null };
  if (!operator?.phone) {
    return { result: { status: 'skipped', reason: NO_MOBILE_REASON } };
  }
  const mobile = australianMobile(operator.phone);
  if (!mobile) {
    return { result: { status: 'skipped', reason: 'Text not sent: the Operator\'s mobile number isn\'t an Australian mobile' } };
  }
  const masked = maskedMobile(mobile);
  if (!customOutputs.smsConfigurationSetName) {
    return { result: { status: 'skipped', reason: 'Text not sent: texting isn\'t set up on this site' }, mobile: masked };
  }
  if (!isTextableHere(mobile.international)) {
    return { result: { status: 'skipped', reason: 'Text not sent: development only texts test numbers' }, mobile: masked };
  }

  try {
    const result = await smsClient.send(
      new SendTextMessageCommand({
        DestinationPhoneNumber: mobile.international,
        OriginationIdentity: customOutputs.smsSenderId || 'NullDevice',
        MessageBody: body,
        MessageType: 'TRANSACTIONAL',
        ConfigurationSetName: customOutputs.smsConfigurationSetName,
      })
    );
    console.log(`Notify Operator text sent to ${masked}, MessageId: ${result.MessageId}`);
    return { result: { status: 'sent', to: mobile.local }, mobile: masked };
  } catch (err) {
    console.error('SMS send failed:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return { result: { status: 'failed', reason: `Text not sent: ${errorMessage}` }, mobile: masked };
  }
}
