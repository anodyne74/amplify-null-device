/**
 * Sign Run transitions — the one place that decides what a Driver Sign Run
 * write does to a Route or Stop.
 *
 * lib/signRunPhase.ts reads where a route sits in Load -> Placement -> Pickup
 * -> Unload -> Finalise; this module owns moving it along. Each operator
 * action is a transition value (e.g. `{ type: 'confirmLoad', at, loadedSignsCount }`):
 *
 * - planSignRunTransition is pure: it refuses a transition the route isn't on
 *   the right phase for, and otherwise returns the exact patch to write.
 * - runSignRunTransition plans, writes, and returns the route as it now
 *   stands, or a user-facing error.
 *
 * The phase check runs against the route the caller already holds — there's
 * no refetch, so it guards against a stale screen, not against a concurrent
 * write from another device.
 *
 * Stops are settled done/skipped for Placement/Pickup the same way:
 * planStopSettlement is pure, runStopSettlement writes it.
 */
import { fetchAuthSession } from 'aws-amplify/auth';
import { getSignRunPhase, type SignRunPhaseInfo } from '@/lib/signRunPhase';
import { sumBilledMinutes } from '@/lib/signRunBilling';
import {
  removeMarker,
  upsertMarker,
  PLACEMENT_DONE_MARKER,
  PLACEMENT_SKIPPED_MARKER,
  PICKUP_DONE_MARKER,
  PICKUP_SKIPPED_MARKER,
  type ExecutionPhase,
} from '@/lib/stopExecutionMarkers';
import type { Route, RouteExecutionPhase, Stop } from '@/amplify/types';
import { updateRoute, updateStopExecution } from '@/lib/routes';

export type SignRunTransition =
  | { type: 'startLoad'; at: string }
  | { type: 'confirmLoad'; at: string; loadedSignsCount: number }
  | { type: 'startPlacement'; at: string }
  | { type: 'completePlacement'; at: string }
  | { type: 'startPickup'; at: string }
  | { type: 'completePickup'; at: string }
  | { type: 'startUnload'; at: string }
  | { type: 'confirmUnload'; at: string }
  | { type: 'finalise'; billedMinutes: Record<RouteExecutionPhase, number>; distanceKm: number };

export type SignRunTransitionType = SignRunTransition['type'];

/** The Route fields a transition reads. */
export type SignRunTransitionRoute = Pick<
  Route,
  | 'id'
  | 'status'
  | 'executionPhase'
  | 'loadConfirmedAt'
  | 'placementEndTime'
  | 'pickupEndTime'
  | 'unloadConfirmedAt'
  | 'scheduledDate'
  | 'actualStartTime'
  | 'actualEndTime'
>;

export interface SignRunRoutePatch {
  status?: 'in_progress' | 'completed' | NonNullable<Route['status']>;
  executionPhase?: RouteExecutionPhase;
  actualStartTime?: string;
  actualEndTime?: string;
  loadStartedAt?: string;
  loadConfirmedAt?: string;
  loadedSignsCount?: number;
  placementStartTime?: string;
  placementEndTime?: string;
  pickupStartTime?: string;
  pickupEndTime?: string;
  unloadStartedAt?: string;
  unloadConfirmedAt?: string;
  billedLoadMinutes?: number;
  billedPlacementMinutes?: number;
  billedPickupMinutes?: number;
  billedUnloadMinutes?: number;
  overrideDurationMinutes?: number;
  overrideDistanceKm?: number;
}

const TRANSITION_PHASE: Record<SignRunTransitionType, { phaseIdx: SignRunPhaseInfo['phaseIdx']; label: string }> = {
  startLoad: { phaseIdx: 0, label: 'Load' },
  confirmLoad: { phaseIdx: 0, label: 'Load' },
  startPlacement: { phaseIdx: 1, label: 'Placement' },
  completePlacement: { phaseIdx: 1, label: 'Placement' },
  startPickup: { phaseIdx: 2, label: 'Pickup' },
  completePickup: { phaseIdx: 2, label: 'Pickup' },
  startUnload: { phaseIdx: 3, label: 'Unload' },
  confirmUnload: { phaseIdx: 3, label: 'Unload' },
  finalise: { phaseIdx: 4, label: 'Finalise' },
};

const WRITE_ERROR: Record<SignRunTransitionType, string> = {
  startLoad: 'Could not start the load. Try again.',
  confirmLoad: 'Could not confirm the load. Try again.',
  startPlacement: 'Could not start placement. Try again.',
  completePlacement: 'Could not close out placement. Try again.',
  startPickup: 'Could not start pickup. Try again.',
  completePickup: 'Could not close out pickup. Try again.',
  startUnload: 'Could not start the unload. Try again.',
  confirmUnload: 'Could not confirm the unload. Try again.',
  finalise: 'Could not complete the route. Try again.',
};

export function planSignRunTransition(
  route: SignRunTransitionRoute,
  transition: SignRunTransition
): { patch: SignRunRoutePatch } | { refused: string } {
  const required = TRANSITION_PHASE[transition.type];
  // Stop count only affects the planned-route lock, not the phase index.
  const current = getSignRunPhase(route, 0);
  if (!current) {
    return { refused: 'This route is already completed.' };
  }
  if (current.phaseIdx !== required.phaseIdx) {
    return { refused: `This route is not currently on the ${required.label} phase.` };
  }

  switch (transition.type) {
    case 'startLoad':
      return { patch: { loadStartedAt: transition.at, actualStartTime: route.actualStartTime ?? transition.at } };
    case 'confirmLoad':
      return {
        patch: {
          loadConfirmedAt: transition.at,
          loadedSignsCount: transition.loadedSignsCount,
          executionPhase: 'placement',
          status: route.status === 'planned' ? 'in_progress' : route.status ?? 'in_progress',
        },
      };
    case 'startPlacement':
      return { patch: { placementStartTime: transition.at } };
    case 'completePlacement':
      return { patch: { executionPhase: 'pickup', placementEndTime: transition.at } };
    case 'startPickup':
      return { patch: { pickupStartTime: transition.at } };
    case 'completePickup':
      return { patch: { executionPhase: 'unload', pickupEndTime: transition.at } };
    case 'startUnload':
      return { patch: { unloadStartedAt: transition.at } };
    case 'confirmUnload':
      return { patch: { unloadConfirmedAt: transition.at, actualEndTime: route.actualEndTime ?? transition.at } };
    case 'finalise':
      return {
        patch: {
          billedLoadMinutes: transition.billedMinutes.load,
          billedPlacementMinutes: transition.billedMinutes.placement,
          billedPickupMinutes: transition.billedMinutes.pickup,
          billedUnloadMinutes: transition.billedMinutes.unload,
          overrideDurationMinutes: sumBilledMinutes(transition.billedMinutes),
          overrideDistanceKm: transition.distanceKm,
          status: 'completed',
        },
      };
  }
}

/**
 * Sign Run phase transitions (Start Placement, Complete Pickup, etc.) have been
 * reported taking 20-30s in the field with no matching AppSync/DynamoDB latency
 * (#266) — the leading theory is a stalled Cognito token refresh happening before
 * the mutation is even sent. Timing the token check separately from the mutation
 * itself is meant to confirm or rule that out from a real occurrence in the field.
 */
async function writeRoutePatch(routeId: string, patch: SignRunRoutePatch) {
  const authCheckStart = performance.now();
  await fetchAuthSession();
  const authCheckMs = Math.round(performance.now() - authCheckStart);

  const mutationStart = performance.now();
  const result = await updateRoute(routeId, patch);
  const mutationMs = Math.round(performance.now() - mutationStart);

  console.info(
    `[sign-run-timing] route=${routeId} authCheckMs=${authCheckMs} mutationMs=${mutationMs} totalMs=${authCheckMs + mutationMs}`
  );

  return result;
}

export async function runSignRunTransition<R extends SignRunTransitionRoute>(
  route: R,
  transition: SignRunTransition
): Promise<{ route: R } | { error: string }> {
  const plan = planSignRunTransition(route, transition);
  if ('refused' in plan) {
    return { error: plan.refused };
  }

  try {
    const { errors } = await writeRoutePatch(route.id, plan.patch);
    if (errors && errors.length > 0) {
      return { error: WRITE_ERROR[transition.type] };
    }
  } catch {
    return { error: WRITE_ERROR[transition.type] };
  }

  return { route: { ...route, ...plan.patch } };
}

/**
 * Which phase's done/skipped markers a route's stops are being settled
 * against right now, or null outside Placement/Pickup. Legacy signs_placed
 * routes predate executionPhase and read as Pickup.
 */
export function stopPhaseOf(route: Pick<Route, 'status' | 'executionPhase'>): ExecutionPhase | null {
  if (route.status === 'signs_placed') return 'pickup';
  if (route.status !== 'in_progress') return null;
  if (route.executionPhase === 'placement') return 'placement';
  if (route.executionPhase === 'pickup') return 'pickup';
  return null;
}

export interface StopSettlementPatch {
  actualArrivalTime: string;
  actualDepartureTime: string;
  notes: Stop['notes'];
}

export interface StopSettlement {
  phase: ExecutionPhase;
  action: 'complete' | 'skip';
  /** Only meaningful for action: 'skip' — an operator-entered reason for skipping. */
  reason?: string;
}

function markersForPhase(phase: ExecutionPhase) {
  return phase === 'placement'
    ? { done: PLACEMENT_DONE_MARKER, skipped: PLACEMENT_SKIPPED_MARKER }
    : { done: PICKUP_DONE_MARKER, skipped: PICKUP_SKIPPED_MARKER };
}

/**
 * Marks a stop done or skipped for the placement/pickup phase, embedding the
 * marker in Stop.notes (see lib/stopExecutionMarkers.ts) and clearing the
 * opposite one, so a skipped stop can later be completed and vice versa.
 */
export function planStopSettlement(
  stop: Pick<Stop, 'notes' | 'actualArrivalTime'>,
  { phase, action, reason }: StopSettlement,
  at: string
): StopSettlementPatch {
  const { done, skipped } = markersForPhase(phase);
  const marker = action === 'complete' ? done : skipped;
  const otherMarker = action === 'complete' ? skipped : done;
  const notes = removeMarker(upsertMarker(stop.notes, marker, at, reason), otherMarker);

  return {
    actualArrivalTime: stop.actualArrivalTime ?? at,
    actualDepartureTime: at,
    notes,
  };
}

/**
 * Writes a stop settlement and returns the patch for the caller to apply —
 * callers differ in how (splice into local state vs. refetch).
 */
export async function runStopSettlement(
  stop: Pick<Stop, 'id' | 'notes' | 'actualArrivalTime'>,
  settlement: StopSettlement
): Promise<{ patch: StopSettlementPatch } | { error: string }> {
  const patch = planStopSettlement(stop, settlement, new Date().toISOString());
  try {
    const { errors } = await updateStopExecution(stop.id, patch);
    if (errors && errors.length > 0) {
      return { error: 'Could not save that stop. Try again.' };
    }
  } catch {
    return { error: 'Could not save that stop. Try again.' };
  }
  return { patch };
}
