import { NextRequest, NextResponse } from 'next/server';
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { authorizeIamRequest } from '@/lib/server/authorizeIamRequest';
import { invoiceRecipientEmail } from '@/lib/server/invoiceRecipient';
import { listAll } from '@/lib/listAll';
import { recordAudit } from '@/lib/auditLog';
import { missingSignsReportDecision, missingSignsReportEmail, missingSignsReportRecipients } from '@/lib/missingSignsReport';
import { ADMIN_EMAIL, APP_DOMAIN } from '@/lib/publicAppConfig';
import type { Route, Stop } from '@/amplify/types';

const sesClient = new SESClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });

/**
 * Sends a finalised Route's Missing Signs Report (CONTEXT.md), if it should go
 * (lib/missingSignsReport.ts), to the invoice recipient and billing CCs with
 * admin@ copied. Asked for after Finalise saves, by the Operator's outbox or
 * the administrator's Finalise, so it may be asked twice: once sent, the Route
 * is stamped and a later request does nothing. Best-effort -- Finalise never
 * waits on it -- and every outcome bar "already sent" is audited.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeIamRequest(request, ['operator', 'administrator']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { client, claims } = auth;

    const { routeId } = await request.json();
    if (typeof routeId !== 'string' || !routeId) return NextResponse.json({ error: 'routeId is required' }, { status: 400 });

    const { data: routeData } = await client.models.Route.get({ id: routeId });
    if (!routeData) return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    // The generated model type carries relationship loaders Route doesn't; only its fields are read.
    const route = routeData as unknown as Route;

    const [{ data: customer }, { data: stops, errors: stopErrors }] = await Promise.all([
      client.models.Customer.get({ id: route.customerId }),
      listAll(client, 'Stop', { filter: { routeId: { eq: routeId } } }),
    ]);
    if (!customer || stopErrors.length > 0) {
      console.error('Loading the Missing Signs Report failed:', stopErrors);
      return NextResponse.json({ error: 'Could not load the route.' }, { status: 500 });
    }

    const audit = (details: Record<string, unknown>, failure?: string) =>
      recordAudit(client, {
        actor: claims.sub,
        customerId: route.customerId,
        eventType: 'data_access',
        resource: { type: 'route', id: route.id },
        action: 'route.missingSignsReport.send',
        failure,
        details,
      }).then((result) => {
        if (!result.ok) console.error('The Missing Signs Report audit entry could not be written:', result.errors);
      });

    const decision = missingSignsReportDecision({ route, customer, stops: stops as unknown as Stop[] });
    if (!decision.send) {
      if (decision.reason !== 'already sent') await audit({ outcome: 'skipped', reason: decision.reason });
      return NextResponse.json({ outcome: 'skipped', reason: decision.reason });
    }

    const recipients = missingSignsReportRecipients({
      invoiceRecipient: await invoiceRecipientEmail(client, customer),
      billingCcEmails: customer.billingCcEmails,
      adminEmail: ADMIN_EMAIL,
    });
    const recipientCount = recipients.to.length + recipients.cc.length;
    if (recipients.cc.length === 0) console.warn(`Route ${route.id}: the Customer has no email, so its Missing Signs Report goes to admin@ only.`);

    const email = missingSignsReportEmail({
      routeCode: route.routeCode || route.id.slice(0, 8),
      customerName: customer.name,
      placementDate: route.scheduledDate,
      pickupDate: route.pickupDate,
      properties: decision.properties,
      total: decision.total,
    });

    try {
      const sent = await sesClient.send(
        new SendEmailCommand({
          Source: process.env.SES_SENDER_EMAIL || `no-reply@${APP_DOMAIN}`,
          Destination: { ToAddresses: recipients.to, CcAddresses: recipients.cc },
          Message: { Subject: { Data: email.subject }, Body: { Text: { Data: email.text } } },
        })
      );
      console.log('Missing Signs Report sent:', sent.MessageId);
    } catch (err) {
      console.error('Sending the Missing Signs Report failed:', err);
      await audit({ outcome: 'failed', recipients: recipientCount }, 'Email could not be sent');
      return NextResponse.json({ outcome: 'failed' });
    }

    const { errors } = await client.models.Route.update({ id: route.id, missingSignsReportSentAt: new Date().toISOString() });
    if (errors?.length) console.error('The Missing Signs Report was sent, but the Route could not be stamped:', errors);
    await audit({ outcome: 'sent', recipients: recipientCount });
    return NextResponse.json({ outcome: 'sent' });
  } catch (err) {
    console.error('Unexpected error in missing-signs-report:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
