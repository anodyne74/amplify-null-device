import { fetchUserId } from '@/lib/amplify-config';
import { getDataClient } from '@/lib/data-client';
import { updateRoute } from '@/lib/routes';
import { planSignRunTransition, type SignRunTransitionRoute } from '@/lib/signRunTransitions';
import type { Route, RouteExecutionPhase } from '@/amplify/types';

// `finalised` is set when the Route was finalised but its audit entry wasn't written.
type Result = { ok: true } | { ok: false; error: string; finalised?: true };

/**
 * An administrator finalises a Route that's waiting on Finalise (#408). It
 * writes what the operator's Finalise writes, from the same plan, but saves it
 * straight away rather than through the operator's outbox, and is audited.
 */
export async function finaliseRouteAsAdministrator(
  route: SignRunTransitionRoute & Pick<Route, 'customerId'>,
  input: { billedMinutes: Record<RouteExecutionPhase, number>; distanceKm: number }
): Promise<Result> {
  const plan = planSignRunTransition(route, { type: 'finalise', ...input });
  if ('refused' in plan) return { ok: false, error: plan.refused };

  const { errors } = await updateRoute(route.id, plan.patch);
  if (errors?.length) return { ok: false, error: 'Could not finalise the route. Nothing was changed.' };

  const adminSub = await fetchUserId();
  const { errors: auditErrors } = await getDataClient().models.AuditLog.create({
    // customerId keys an index, so it's left out rather than sent as null.
    customerId: route.customerId ?? undefined,
    operatorId: adminSub,
    eventType: 'data_modification',
    resourceType: 'route',
    resourceId: route.id,
    action: 'route.finalise',
    status: 'success',
    timestamp: new Date().toISOString(),
    // a.json() fields travel as a JSON string.
    details: JSON.stringify({ billedMinutes: input.billedMinutes, distanceKm: input.distanceKm }),
  });
  if (auditErrors?.length) {
    console.error('Writing the route finalise audit entry failed:', auditErrors);
    return { ok: false, error: 'The route was finalised, but its audit entry could not be written.', finalised: true };
  }
  return { ok: true };
}
