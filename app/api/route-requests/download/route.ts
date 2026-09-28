import { NextRequest, NextResponse } from 'next/server';
import { authorizeIamRequest } from '@/lib/server/authorizeIamRequest';
import { signedRouteRequestFileUrl } from '@/lib/server/reportStorage';
import { customerAttachment } from '@/lib/customerRouteRequestView';

/**
 * A short-lived download link to a file a customer can see on a Route Request
 * or Route Amendment (#360, ADR 0008): body { requestId, attachment }, the
 * attachment's position. The record must be linked to a Route of the caller's
 * Customer; staff may use it too. Hidden inline images aren't handed out.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeIamRequest(request, ['customer', 'operator', 'administrator']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => null);
    const requestId = typeof body?.requestId === 'string' ? body.requestId.trim() : '';
    const index = body?.attachment;
    if (!requestId || !(Number.isInteger(index) && index >= 0)) {
      return NextResponse.json({ error: "requestId and attachment (the attachment's position) are required" }, { status: 400 });
    }

    const { data: record, errors } = await auth.client.models.RouteRequestRecord.get({ id: requestId });
    if (errors?.length) {
      console.error('Reading the Route Request failed:', errors);
      return NextResponse.json({ error: 'Could not open the file' }, { status: 500 });
    }
    const { data: route, errors: routeErrors } = record?.routeId
      ? await auth.client.models.Route.get({ id: record.routeId }, { selectionSet: ['id', 'customerId'] })
      : { data: null, errors: undefined };
    if (routeErrors?.length) {
      console.error('Reading the Route failed:', routeErrors);
      return NextResponse.json({ error: 'Could not open the file' }, { status: 500 });
    }
    // Missing, not linked, or another Customer's: a customer can't tell which.
    if (auth.caller.audience === 'customer' && (!route || route.customerId !== auth.caller.customerId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const attachment = record && route ? customerAttachment(record, index) : null;
    if (!attachment) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    return NextResponse.json({ url: await signedRouteRequestFileUrl(attachment.key, attachment.filename) });
  } catch (err) {
    console.error('Opening a Route Request file for download failed:', err);
    return NextResponse.json({ error: 'Could not open the file' }, { status: 500 });
  }
}
