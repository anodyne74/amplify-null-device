import { NextRequest, NextResponse } from 'next/server';
import { SendTemplatedEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { authorizeIamRequest } from '@/lib/server/authorizeIamRequest';
import { customOutputs } from '@/lib/amplifyOutputsCustom';
import { APP_DOMAIN } from '@/lib/publicAppConfig';
import { listAll } from '@/lib/listAll';

const sesClient = new SESClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });

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
      stopCount: String(stops.length),
      routeUrl: `${resolvedAppBaseUrl}/operator/routes/detail?id=${routeId}`,
      logoUrl,
      year: `${new Date().getUTCFullYear()}`,
    };

    const senderEmail = process.env.SES_SENDER_EMAIL || `no-reply@${APP_DOMAIN}`;

    let messageId: string;
    try {
      const result = await sesClient.send(
        new SendTemplatedEmailCommand({
          Source: senderEmail,
          Destination: { ToAddresses: [route.assignedOperatorEmail] },
          Template: jobAssignedTemplateName,
          TemplateData: JSON.stringify(templateData),
        })
      );
      messageId = result.MessageId || '';
      console.log(`Job-assigned email sent to ${route.assignedOperatorEmail}, MessageId: ${messageId}`);
    } catch (err) {
      console.error('SES send failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return NextResponse.json({ error: `Failed to send email: ${errorMessage}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      messageId,
      sentTo: route.assignedOperatorEmail,
      routeCode: route.routeCode,
    });
  } catch (err) {
    console.error('Unexpected error in send-job-assigned-email:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Internal server error: ${errorMessage}` }, { status: 500 });
  }
}
