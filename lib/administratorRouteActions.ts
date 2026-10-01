/**
 * What an administrator can change on a Route from its detail page: settle a
 * Stop done or skipped, Finalise, and correct the Billed Time. Unlike the
 * operator's Sign Run (lib/signRunTransitions.ts and its outbox), each one is
 * saved straight away and recorded in the audit log, and they all report the
 * same way. Settling and Finalise write what the operator's would, from the
 * same plans.
 */
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
import { updateRoute, updateStopExecution } from '@/lib/routes';
import {
  planSignRunTransition,
  planStopSettlement,
  stopPhaseOf,
  type SignRunTransitionRoute,
  type StopSettlement,
} from '@/lib/signRunTransitions';
import { takesPartIn } from '@/lib/stopProgress';
import type { Route, RouteExecutionPhase, Stop } from '@/amplify/types';

/** `saved` is set when the change was written but its audit entry wasn't, so
 *  the caller should still reload what it shows. */
export type AdministratorActionResult = { ok: true } | { ok: false; error: string; saved: boolean };

const refused = (error: string): AdministratorActionResult => ({ ok: false, error, saved: false });

interface AuditedChange {
  resourceType: 'route' | 'stop';
  resourceId: string;
  customerId?: string | null;
  action: string;
  details: unknown;
}

/** Writes a change and then its audit entry. Nothing is audited if the write fails. */
async function saveAudited(
  write: () => Promise<{ errors?: readonly unknown[] | null }>,
  change: AuditedChange,
  messages: { failed: string; unaudited: string }
): Promise<AdministratorActionResult> {
  const { errors } = await write();
  if (errors?.length) return refused(messages.failed);

  const adminSub = await fetchUserId();
  const { errors: auditErrors } = await getDataClient().models.AuditLog.create({
    // customerId keys an index, so it's left out rather than sent as null.
    customerId: change.customerId ?? undefined,
    operatorId: adminSub,
    eventType: 'data_modification',
    resourceType: change.resourceType,
    resourceId: change.resourceId,
    action: change.action,
    status: 'success',
    timestamp: new Date().toISOString(),
    // a.json() fields travel as a JSON string.
    details: JSON.stringify(change.details),
  });
  if (auditErrors?.length) {
    console.error(`Writing the ${change.action} audit entry failed:`, auditErrors);
    return { ok: false, error: messages.unaudited, saved: true };
  }
  return { ok: true };
}

const PHASE_LABELS = { placement: 'Placement', pickup: 'Pickup' } as const;

/**
 * An administrator settles a Stop done or skipped for the phase its Route is
 * on, as the operator would. Refused, writing nothing, outside Placement and
 * Pickup or for a Stop that isn't visited in the phase.
 */
export async function settleStopAsAdministrator(
  route: Pick<Route, 'status' | 'executionPhase'>,
  stop: Pick<Stop, 'id' | 'routeId' | 'customerId' | 'notes' | 'actualArrivalTime' | 'serviceType'>,
  settlement: Omit<StopSettlement, 'phase'>
): Promise<AdministratorActionResult> {
  const phase = stopPhaseOf(route);
  if (!phase) return refused('Stops can only be settled while the route is on Placement or Pickup.');
  if (!takesPartIn(stop, phase)) return refused(`This stop isn't visited during ${PHASE_LABELS[phase]}.`);

  const patch = planStopSettlement(stop, { ...settlement, phase }, new Date().toISOString());
  return saveAudited(
    () => updateStopExecution(stop.id, patch),
    {
      resourceType: 'stop',
      resourceId: stop.id,
      customerId: stop.customerId,
      action: 'stop.settle',
      details: { routeId: stop.routeId, phase, action: settlement.action, reason: settlement.reason ?? null },
    },
    {
      failed: 'Could not save that stop. Nothing was changed.',
      unaudited: 'The stop was saved, but its audit entry could not be written.',
    }
  );
}

/**
 * An administrator finalises a Route that's waiting on Finalise (#408). It
 * writes what the operator's Finalise writes, from the same plan.
 */
export async function finaliseRouteAsAdministrator(
  route: SignRunTransitionRoute & Pick<Route, 'customerId'>,
  input: { billedMinutes: Record<RouteExecutionPhase, number>; distanceKm: number }
): Promise<AdministratorActionResult> {
  const plan = planSignRunTransition(route, { type: 'finalise', ...input });
  if ('refused' in plan) return refused(plan.refused);

  return saveAudited(
    () => updateRoute(route.id, plan.patch),
    {
      resourceType: 'route',
      resourceId: route.id,
      customerId: route.customerId,
      action: 'route.finalise',
      details: { billedMinutes: input.billedMinutes, distanceKm: input.distanceKm },
    },
    {
      failed: 'Could not finalise the route. Nothing was changed.',
      unaudited: 'The route was finalised, but its audit entry could not be written.',
    }
  );
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
): Promise<AdministratorActionResult> {
  if (route.status !== 'completed' && route.status !== 'archived') {
    return refused('Billed Time can only be corrected once the route is completed.');
  }

  const patch =
    'billedMinutes' in correction
      ? billedTimePatch(correction.billedMinutes, correction.distanceKm)
      : billedTotalPatch(correction.totalMinutes, correction.distanceKm);
  if (patch.overrideDurationMinutes <= 0 || !isBillableTotal(patch.overrideDurationMinutes)) {
    return refused('The total charged must land on a 15 min increment.');
  }
  if (patch.overrideDistanceKm < 0) return refused('Enter a distance of 0 km or more.');

  return saveAudited(
    () => updateRoute(route.id, patch),
    {
      resourceType: 'route',
      resourceId: route.id,
      customerId: route.customerId,
      action: 'route.billedTime.correct',
      details: { before: billedTime(route), after: billedTime({ ...route, ...patch }) },
    },
    {
      failed: 'Could not save the Billed Time. Nothing was changed.',
      unaudited: 'The Billed Time was saved, but its audit entry could not be written.',
    }
  );
}
