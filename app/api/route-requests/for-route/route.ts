import { NextRequest, NextResponse } from 'next/server';
import { authorizeIamRequest } from '@/lib/server/authorizeIamRequest';
import { listAllPages } from '@/lib/listAll';
import { toCustomerRouteRequests, type StoredRouteRequest } from '@/lib/customerRouteRequestView';

/**
 * A Route's Route Request and Route Amendments as its Customer sees them
 * (#360, ADR 0008): body { routeId }. Any Customer User of the Customer that
 * owns the Route, and staff. Customers have no AppSync access to the records,
 * so this is the only way they read them, and only the customer-facing shape.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeIamRequest(request, ['customer', 'operator', 'administrator']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => null);
    const routeId = typeof body?.routeId === 'string' ? body.routeId.trim() : '';
    if (!routeId) {
      return NextResponse.json({ error: 'routeId is required' }, { status: 400 });
    }

    const { data: route, errors: routeErrors } = await auth.client.models.Route.get({ id: routeId }, { selectionSet: ['id', 'customerId'] });
    if (routeErrors?.length) {
      console.error('Reading the Route failed:', routeErrors);
      return NextResponse.json({ error: 'Could not load the requests' }, { status: 500 });
    }
    // A customer can't tell another Customer's Route from one that doesn't exist.
    if (auth.caller.audience === 'customer' && route?.customerId !== auth.caller.customerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!route) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    const { data, errors } = await listAllPages<StoredRouteRequest>((page) =>
      auth.client.models.RouteRequestRecord.listRouteRequestRecordsByRoute({ routeId }, page)
    );
    if (errors.length > 0) {
      console.error("Reading the Route's requests failed:", errors);
      return NextResponse.json({ error: 'Could not load the requests' }, { status: 500 });
    }
    return NextResponse.json({ requests: toCustomerRouteRequests(data) });
  } catch (err) {
    console.error("Loading a Route's requests failed:", err);
    return NextResponse.json({ error: 'Could not load the requests' }, { status: 500 });
  }
}
