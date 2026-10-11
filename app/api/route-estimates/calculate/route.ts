import { NextRequest, NextResponse } from 'next/server';
import { authorizeIamRequest } from '@/lib/server/authorizeIamRequest';
import { computeRoadLegs } from '@/lib/server/googleRoutes';
import { recordAudit } from '@/lib/auditLog';
import { listAll } from '@/lib/listAll';
import { planRouteEstimate } from '@/lib/routeEstimate';

/**
 * Calculates and stores a Route's Route Estimate (#515, ADR 0011): body
 * { routeId }. Administrators only. Replaces the stored estimate; on any
 * failure stores nothing and leaves the previous one in place. The estimate is
 * informational and never touches Billed Time.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeIamRequest(request, 'administrator');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => null);
    const routeId = typeof body?.routeId === 'string' ? body.routeId.trim() : '';
    if (!routeId) {
      return NextResponse.json({ error: 'routeId is required' }, { status: 400 });
    }

    const { models } = auth.client;
    const { data: route, errors: routeErrors } = await models.Route.get({ id: routeId });
    if (routeErrors?.length) {
      console.error('Reading the Route failed:', routeErrors);
      return NextResponse.json({ error: 'Could not load the Route' }, { status: 500 });
    }
    if (!route) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    const operatorSub = route.assignedOperatorSub ?? null;
    const [operatorResult, stopsResult] = await Promise.all([
      operatorSub ? models.Operator.get({ id: operatorSub }) : Promise.resolve({ data: null, errors: undefined }),
      listAll(auth.client, 'Stop', { filter: { routeId: { eq: routeId } } }),
    ]);
    if (operatorResult.errors?.length || stopsResult.errors.length > 0) {
      console.error('Reading the Route Estimate inputs failed:', operatorResult.errors, stopsResult.errors);
      return NextResponse.json({ error: 'Could not load the Route' }, { status: 500 });
    }

    const operator = operatorResult.data;
    const homeBase =
      operator?.homeBaseLatitude != null && operator?.homeBaseLongitude != null
        ? { latitude: operator.homeBaseLatitude, longitude: operator.homeBaseLongitude }
        : null;
    const plan = planRouteEstimate(route, operator ? { homeBase } : null, stopsResult.data);
    if (!plan.ok) {
      return NextResponse.json({ error: plan.reason }, { status: 422 });
    }

    const audit = (failure?: string, details?: unknown) =>
      recordAudit(auth.client, {
        actor: auth.claims.sub,
        customerId: route.customerId,
        eventType: 'data_modification',
        resource: { type: 'route_estimate', id: routeId },
        action: 'route_estimate.calculate',
        failure,
        details,
      });

    let roadLegs;
    try {
      roadLegs = await computeRoadLegs(plan.points);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not calculate the drive.';
      console.error('Route Estimate calculation failed:', err);
      await audit(message);
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const legs = roadLegs.map((leg, index) => ({
      order: index + 1,
      fromStopId: index === 0 ? null : plan.stopIds[index - 1],
      toStopId: index === roadLegs.length - 1 ? null : plan.stopIds[index],
      distanceMeters: leg.distanceMeters,
      path: leg.path,
    }));
    const totalMeters = legs.reduce((sum, leg) => sum + leg.distanceMeters, 0);
    const estimate = {
      id: routeId,
      operatorSub: operatorSub as string,
      originLatitude: plan.points[0].latitude,
      originLongitude: plan.points[0].longitude,
      stopIds: plan.stopIds,
      stopPins: plan.stopPins,
      leftOutNoPin: plan.leftOut.noPin,
      leftOutRemoved: plan.leftOut.removed,
      totalMeters,
      legs,
      calculatedAt: new Date().toISOString(),
      calculatedBySub: auth.claims.sub,
    };

    const { data: existing } = await models.RouteEstimate.get({ id: routeId });
    const saved = existing ? await models.RouteEstimate.update(estimate) : await models.RouteEstimate.create(estimate);
    if (saved.errors?.length) {
      console.error('Storing the Route Estimate failed:', saved.errors);
      await audit('Could not store the estimate.');
      return NextResponse.json({ error: 'Could not store the estimate' }, { status: 500 });
    }

    const audited = await audit(undefined, { totalMeters, legs: legs.length, ...plan.leftOut });
    if (!audited.ok) console.error('Route Estimate audit entry failed:', audited.errors);

    return NextResponse.json({ estimate });
  } catch (err) {
    console.error('Calculating a Route Estimate failed:', err);
    return NextResponse.json({ error: 'Could not calculate the estimate' }, { status: 500 });
  }
}
