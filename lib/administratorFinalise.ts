import { fetchUserId } from '@/lib/amplify-config';
import {
  billedTime,
  billedTimePatch,
  billedTotalPatch,
  isBillableTotal,
  type BilledPhaseMinutes,
  type BilledTimeRoute,
} from '@/lib/billedTime';
import { getDataClient } from '@/lib/data-client';
import { updateRoute } from '@/lib/routes';
import { planSignRunTransition, type SignRunTransitionRoute } from '@/lib/signRunTransitions';
import type { Route, RouteExecutionPhase } from '@/amplify/types';

// `finalised` is set when the Route was finalised but its audit entry wasn't written.
type Result = { ok: true } | { ok: false; error: string; finalised?: true };

// `saved` is set when the Billed Time was saved but its audit entry wasn't written.
type CorrectionResult = { ok: true } | { ok: false; error: string; saved?: true };

/** An administrator's audited change to a Route. Resolves false if the entry wasn't written. */
async function auditRouteChange(route: Pick<Route, 'id' | 'customerId'>, action: string, details: unknown): Promise<boolean> {
  const adminSub = await fetchUserId();
  const { errors } = await getDataClient().models.AuditLog.create({
    // customerId keys an index, so it's left out rather than sent as null.
    customerId: route.customerId ?? undefined,
    operatorId: adminSub,
    eventType: 'data_modification',
    resourceType: 'route',
    resourceId: route.id,
    action,
    status: 'success',
    timestamp: new Date().toISOString(),
    // a.json() fields travel as a JSON string.
    details: JSON.stringify(details),
  });
  if (errors?.length) {
    console.error(`Writing the ${action} audit entry failed:`, errors);
    return false;
  }
  return true;
}

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

  const audited = await auditRouteChange(route, 'route.finalise', {
    billedMinutes: input.billedMinutes,
    distanceKm: input.distanceKm,
  });
  if (!audited) return { ok: false, error: 'The route was finalised, but its audit entry could not be written.', finalised: true };
  return { ok: true };
}

/** A Route with phases is corrected phase by phase; a total-only Route by its total. */
export type BilledTimeCorrection =
  | { billedMinutes: BilledPhaseMinutes; distanceKm: number }
  | { totalMinutes: number; distanceKm: number };

/**
 * An administrator corrects a completed Route's Billed Time, keeping the rules
 * Finalise keeps. Audited with the Billed Time before and after. An Invoice
 * already raised for the Route is left as it is.
 */
export async function correctBilledTime(
  route: BilledTimeRoute & Pick<Route, 'id' | 'customerId' | 'status'>,
  correction: BilledTimeCorrection
): Promise<CorrectionResult> {
  if (route.status !== 'completed' && route.status !== 'archived') {
    return { ok: false, error: 'Billed Time can only be corrected once the route is completed.' };
  }

  const patch =
    'billedMinutes' in correction
      ? billedTimePatch(correction.billedMinutes, correction.distanceKm)
      : billedTotalPatch(correction.totalMinutes, correction.distanceKm);
  if (patch.overrideDurationMinutes <= 0 || !isBillableTotal(patch.overrideDurationMinutes)) {
    return { ok: false, error: 'The total charged must land on a 15 min increment.' };
  }
  if (patch.overrideDistanceKm < 0) return { ok: false, error: 'Enter a distance of 0 km or more.' };

  const before = billedTime(route);
  const { errors } = await updateRoute(route.id, patch);
  if (errors?.length) return { ok: false, error: 'Could not save the Billed Time. Nothing was changed.' };

  const audited = await auditRouteChange(route, 'route.billedTime.correct', {
    before,
    after: billedTime({ ...route, ...patch }),
  });
  if (!audited) return { ok: false, error: 'The Billed Time was saved, but its audit entry could not be written.', saved: true };
  return { ok: true };
}
