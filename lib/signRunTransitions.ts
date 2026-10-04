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
 * - queueSignRunTransition plans, applies the patch on the operator's device
 *   and queues its write in the Sign Run outbox (lib/signRunOutbox.ts), or
 *   returns the refusal. The operator never waits on the save.
 *
 * The phase check runs against the route the caller already holds — there's
 * no refetch, so it guards against a stale screen, not against a concurrent
 * write from another device.
 *
 * Stops are settled the same way -- done in Placement or Pickup, or Couldn't
 * Collect in Pickup: planStopSettlement is pure, and queueStopSettlement
 * queues it for the operator's Sign Run. So are Removed Stops and Load
 * Changes (lib/loadChange.ts), through queueStopChange. An administrator's
 * settlement, removal, restore and Finalise reuse the plans but save straight
 * away (lib/administratorRouteActions.ts).
 */
import { getSignRunPhase, type SignRunPhaseInfo } from '@/lib/signRunPhase';
import { billedTimePatch } from '@/lib/billedTime';
import { settleStopNotes, type ExecutionPhase } from '@/lib/stopProgress';
import type { Route, RouteExecutionPhase, Stop } from '@/amplify/types';
import { signRunOutbox } from '@/lib/signRunOutbox';
import type { StopChangeKind, StopSettlementKind } from '@/lib/signRunTiming';
import {
  planStopAddition,
  planStopRemoval,
  planStopRestore,
  type LoadChangeRoute,
  type LoadStopInput,
  type RemovalWindow,
} from '@/lib/loadChange';

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
          ...billedTimePatch(transition.billedMinutes, transition.distanceKm),
          status: 'completed',
        },
      };
  }
}

/**
 * Applies a transition on the operator's device straight away and queues its
 * write in the Sign Run outbox (#355): the returned route is how the
 * operator's screens now show it, whether or not it has saved yet. A refused
 * transition queues nothing.
 */
export function queueSignRunTransition<R extends SignRunTransitionRoute>(
  route: R,
  transition: SignRunTransition
): { route: R } | { error: string } {
  const plan = planSignRunTransition(route, transition);
  if ('refused' in plan) {
    return { error: plan.refused };
  }
  signRunOutbox.enqueue({
    routeId: route.id,
    target: 'Route',
    recordId: route.id,
    kind: transition.type,
    patch: { ...plan.patch },
  });
  return { route: { ...route, ...plan.patch } };
}

/**
 * Which phase a route's stops are being settled
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
  notes: string;
}

/** Done in Placement or Pickup, or Couldn't Collect in Pickup with the operator's reason. */
export type StopSettlement =
  | { phase: ExecutionPhase; action: 'complete' }
  | { phase: 'pickup'; action: 'couldntCollect'; reason: string };

/**
 * Settles a stop for the placement/pickup phase (its Stop Progress,
 * lib/stopProgress.ts), so a Couldn't Collect stop can later be done and vice
 * versa. actualDepartureTime is when it was last settled, a time only.
 */
export function planStopSettlement(
  stop: Pick<Stop, 'notes' | 'actualArrivalTime'>,
  settlement: StopSettlement,
  at: string
): StopSettlementPatch {
  const notes =
    settlement.action === 'couldntCollect'
      ? settleStopNotes(stop.notes, 'pickup', 'couldntCollect', at, settlement.reason)
      : settleStopNotes(stop.notes, settlement.phase, 'complete', at);

  return {
    actualArrivalTime: stop.actualArrivalTime ?? at,
    actualDepartureTime: at,
    notes,
  };
}

function settlementKind(settlement: StopSettlement): StopSettlementKind {
  return settlement.action === 'couldntCollect' ? 'pickupStopCouldntCollect' : `${settlement.phase}StopDone`;
}

/**
 * Queues a stop settlement in the Sign Run outbox — the operator's Sign Run
 * screens, where it shows at once (see queueSignRunTransition).
 */
export function queueStopSettlement(
  stop: Pick<Stop, 'id' | 'routeId' | 'notes' | 'actualArrivalTime'>,
  settlement: StopSettlement
): { patch: StopSettlementPatch } {
  const patch = planStopSettlement(stop, settlement, new Date().toISOString());
  signRunOutbox.enqueue({
    routeId: stop.routeId,
    target: 'Stop',
    recordId: stop.id,
    kind: settlementKind(settlement),
    patch: { ...patch },
  });
  return { patch };
}

type ChangedStop = Pick<Stop, 'id' | 'removed' | 'removedReason' | 'address' | 'propertyKey' | 'notes' | 'actualDepartureTime'>;

/** A Removed Stop or Load Change: remove (with a reason, at the door during
 *  Placement), restore, or add (during Load only). */
export type StopChange =
  | { type: 'remove'; stop: ChangedStop; by: string; reason?: string }
  | { type: 'restore'; stop: ChangedStop }
  | { type: 'add'; stops: Array<Pick<Stop, 'sequence'>>; input: LoadStopInput };

const KIND: Record<RemovalWindow, Record<'remove' | 'restore', StopChangeKind>> = {
  load: { remove: 'loadStopRemoved', restore: 'loadStopRestored' },
  placement: { remove: 'placementStopRemoved', restore: 'placementStopRestored' },
};

/** Audited as a Load Change at the yard, and as a plain removal at the door. */
const AUDIT_ACTION: Record<RemovalWindow, Record<'remove' | 'restore', string>> = {
  load: { remove: 'stop.loadChange.remove', restore: 'stop.loadChange.restore' },
  placement: { remove: 'stop.remove', restore: 'stop.restore' },
};

/**
 * Applies a Removed Stop or Load Change on the operator's device straight
 * away and queues its write in the Sign Run outbox, with its audit entry
 * written once it saves (see queueSignRunTransition). A refused change queues
 * nothing.
 */
export function queueStopChange(route: LoadChangeRoute, change: StopChange): { ok: true } | { error: string } {
  const at = new Date().toISOString();

  if (change.type === 'add') {
    const plan = planStopAddition(route, change.stops, change.input, globalThis.crypto.randomUUID(), at);
    if ('refused' in plan) return { error: plan.refused };
    const { id, ...fields } = plan.stop;
    signRunOutbox.enqueue({
      routeId: route.id,
      target: 'NewStop',
      recordId: id,
      kind: 'loadStopAdded',
      patch: { ...fields },
      audit: {
        customerId: route.customerId,
        resourceId: id,
        action: 'stop.loadChange.add',
        details: {
          routeId: route.id,
          address: fields.address,
          agent: fields.agent,
          numberOfSigns: fields.numberOfSigns,
          isAuction: fields.isAuction,
        },
      },
    });
    return { ok: true };
  }

  const plan =
    change.type === 'remove'
      ? planStopRemoval(route, change.stop, change.by, at, change.reason)
      : planStopRestore(route, change.stop);
  if ('refused' in plan) return { error: plan.refused };
  // An operator's restore always has a window; only an administrator's can fall outside one.
  const window = plan.window ?? 'load';
  signRunOutbox.enqueue({
    routeId: route.id,
    target: 'Stop',
    recordId: change.stop.id,
    kind: KIND[window][change.type],
    patch: { ...plan.patch },
    audit: {
      customerId: route.customerId,
      resourceId: change.stop.id,
      action: AUDIT_ACTION[window][change.type],
      details: {
        routeId: route.id,
        address: change.stop.address ?? null,
        propertyKey: change.stop.propertyKey ?? null,
        ...('removedReason' in plan.patch ? { reason: plan.patch.removedReason } : {}),
      },
    },
  });
  return { ok: true };
}
