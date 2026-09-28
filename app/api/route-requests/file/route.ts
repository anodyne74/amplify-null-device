import { NextRequest, NextResponse } from 'next/server';
import { authorizeIamRequest } from '@/lib/server/authorizeIamRequest';
import { signedRawMessageUrl, signedRouteRequestFileUrl } from '@/lib/server/reportStorage';

/**
 * A short-lived download link to one of a Route Request's files (#358): body
 * { requestId, file }, where file is an attachment's position or 'raw' for the
 * message as received. Administrators only, as for the records themselves;
 * nobody else has storage access to requests/ or the inbound mail bucket.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeIamRequest(request, ['administrator']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => null);
    const requestId = typeof body?.requestId === 'string' ? body.requestId.trim() : '';
    const file = body?.file;
    if (!requestId || !(file === 'raw' || (Number.isInteger(file) && file >= 0))) {
      return NextResponse.json({ error: "requestId and file (an attachment's position, or 'raw') are required" }, { status: 400 });
    }

    const { data: routeRequest, errors } = await auth.client.models.RouteRequestEmail.get({ id: requestId });
    if (errors?.length) {
      console.error('Reading the Route Request failed:', errors);
      return NextResponse.json({ error: 'Could not open the file' }, { status: 500 });
    }
    if (!routeRequest) {
      return NextResponse.json({ error: 'Route Request not found' }, { status: 404 });
    }

    if (file === 'raw') {
      return NextResponse.json({ url: await signedRawMessageUrl(routeRequest.rawMessageKey) });
    }
    const attachment = routeRequest.attachments?.[file];
    if (!attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }
    return NextResponse.json({ url: await signedRouteRequestFileUrl(attachment.key, attachment.filename) });
  } catch (err) {
    console.error('Opening a Route Request file failed:', err);
    return NextResponse.json({ error: 'Could not open the file' }, { status: 500 });
  }
}
