import { NextRequest, NextResponse } from 'next/server';
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { loadFeedbackRoute } from '@/lib/server/routeFeedback';
import { planRouteFeedback, routeFeedbackEmail, type RouteFeedbackInput } from '@/lib/routeFeedback';
import { recordAudit } from '@/lib/auditLog';
import { ADMIN_EMAIL, APP_DOMAIN } from '@/lib/publicAppConfig';

const sesClient = new SESClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });

/**
 * Saves a customer user's Route Feedback (CONTEXT.md) on a completed Route
 * that hasn't been invoiced, records it in the audit trail (without the note),
 * and emails admin@ when something was off. The email is best-effort, as in
 * ADR 0006: the feedback stays saved if it can't be sent.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const loaded = await loadFeedbackRoute(request, body.routeId);
    if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });

    const { caller, claims, client, route, invoiced } = loaded;
    const input: RouteFeedbackInput = { tone: body.tone, note: typeof body.note === 'string' ? body.note : '' };
    const plan = planRouteFeedback({
      route,
      caller: { sub: claims.sub, name: caller.row.name, email: caller.row.email },
      invoiced,
      input,
      at: new Date().toISOString(),
    });
    if ('refused' in plan) return NextResponse.json({ error: plan.refused }, { status: plan.status });

    const { errors } = await client.models.Route.update({ id: route.id, ...plan.patch });
    if (errors?.length) {
      console.error('Saving Route Feedback failed:', errors);
      return NextResponse.json({ error: 'Could not send your feedback.' }, { status: 500 });
    }

    const audit = await recordAudit(client, {
      actor: claims.sub,
      customerId: route.customerId,
      eventType: 'data_modification',
      resource: { type: 'route', id: route.id },
      action: 'route.customer_feedback',
      details: { tone: plan.patch.customerFeedbackTone, changed: plan.changed },
    });
    if (!audit.ok) console.error('Route Feedback was saved, but its audit entry could not be written:', audit.errors);

    let emailed = false;
    if (plan.patch.customerFeedbackTone === 'issue') {
      try {
        const { data: customer } = await client.models.Customer.get({ id: route.customerId });
        const email = routeFeedbackEmail({
          routeId: route.id,
          routeCode: route.routeCode || route.id.slice(0, 8),
          customerName: customer?.name || 'A customer',
          byName: plan.patch.customerFeedbackByName,
          note: plan.patch.customerFeedbackNote,
          changed: plan.changed,
          appBaseUrl: process.env.NEXT_PUBLIC_APP_URL || `https://${APP_DOMAIN}`,
        });
        await sesClient.send(
          new SendEmailCommand({
            Source: process.env.SES_SENDER_EMAIL || `no-reply@${APP_DOMAIN}`,
            Destination: { ToAddresses: [ADMIN_EMAIL] },
            Message: { Subject: { Data: email.subject }, Body: { Text: { Data: email.text } } },
          })
        );
        emailed = true;
      } catch (err) {
        console.error('Route Feedback was saved, but emailing admin failed:', err);
      }
    }

    return NextResponse.json({ success: true, emailed });
  } catch (err) {
    console.error('Unexpected error in route-feedback:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
