/**
 * Removed Stops and Load Changes (see CONTEXT.md) — a Stop taken off its Route
 * on the day, at the yard during Load or at the door during Placement, and a
 * Stop added during Load. The one place that decides whether a change is
 * allowed and what it writes, and the one place that knows a Stop is removed.
 *
 * - A removed Stop is kept, marked removed (Stop.removed, with removedAt and
 *   removedBy, and removedReason for one removed at the door), and counts
 *   toward nothing: every count and list reads through activeStops().
 *   Restoring sets removed back to false; nothing is ever cleared to null
 *   (operators can't delete Stops, and an update to null needs that
 *   permission).
 * - An added Stop is a delivery Stop at the end of the order, stamped
 *   addedAtLoad.
 *
 * Pure: queueStopChange (lib/signRunTransitions.ts) applies a plan on the
 * operator's device and saves it through the Sign Run outbox, audited once it
 * saves. An administrator's removal and restore reuse the plans but save
 * straight away (lib/administratorRouteActions.ts).
 */
import { getSignRunPhase } from './signRunPhase';
import { stopPropertyKey } from './propertyKey';
import { stopProgress } from './stopProgress';
import type { Route, Stop } from '../amplify/types';

export function isStopRemoved(stop: { removed?: boolean | null }): boolean {
  return stop.removed === true;
}

/** The Stops that count: every one a Load Change hasn't removed. */
export function activeStops<T extends { removed?: boolean | null }>(stops: T[]): T[] {
  return stops.filter((stop) => !isStopRemoved(stop));
}

/** A Stop removed at the door during Placement, rather than at the yard: only those carry a reason. */
export function isRemovedAtDoor(stop: { removed?: boolean | null; removedReason?: string | null }): boolean {
  return isStopRemoved(stop) && Boolean(stop.removedReason);
}

/** Whether a Route was changed on the day: a Stop added at Load, or one ever removed. */
export function hasLoadChanges(stops: Array<Pick<Stop, 'addedAtLoad' | 'removedAt'>>): boolean {
  return stops.some((stop) => Boolean(stop.addedAtLoad || stop.removedAt));
}

/** The Route fields the Load and Placement windows read. */
export type LoadChangeRoute = Pick<
  Route,
  'id' | 'customerId' | 'status' | 'executionPhase' | 'loadStartedAt' | 'loadConfirmedAt' | 'unloadConfirmedAt'
>;

/** Whether an Operator can make a Load Change: Load started and not yet confirmed. */
export function isLoadChangeOpen(route: Omit<LoadChangeRoute, 'id' | 'customerId'>): boolean {
  const phase = getSignRunPhase(route, 0);
  return phase?.phaseIdx === 0 && Boolean(route.loadStartedAt) && !route.loadConfirmedAt;
}

/** When a Stop can be removed: at the yard during Load, at the door during Placement, or not at all. */
export type RemovalWindow = 'load' | 'placement';

export function removalWindow(route: Omit<LoadChangeRoute, 'id' | 'customerId'>): RemovalWindow | null {
  if (isLoadChangeOpen(route)) return 'load';
  return getSignRunPhase(route, 0)?.phaseIdx === 1 ? 'placement' : null;
}

const OUTSIDE_LOAD = 'Stops can only be added or removed between starting and confirming Load.';

const OUTSIDE_WINDOW = 'Stops can only be removed during Load or Placement.';
const ROUTE_FINALISED = "This route is finalised; its stops can't be restored.";

export const LOAD_STOP_NEEDS_SUBURB = 'Add the suburb to the address, e.g. "30 Faraday St, Carlton".';

export interface StopRemovalPatch {
  removed: true;
  removedAt: string;
  removedBy: string;
  /** Only for a Stop removed at the door during Placement. */
  removedReason?: string;
}

/**
 * Takes a Stop off its Route. During Load it needs no reason; during
 * Placement it needs one, and only a Stop whose signs aren't up yet can go --
 * once placed, its signs are out there.
 */
export function planStopRemoval(
  route: LoadChangeRoute,
  stop: Pick<Stop, 'removed' | 'notes' | 'actualDepartureTime'>,
  by: string,
  at: string,
  reason?: string
): { window: RemovalWindow; patch: StopRemovalPatch } | { refused: string } {
  const window = removalWindow(route);
  if (!window) return { refused: OUTSIDE_WINDOW };
  if (isStopRemoved(stop)) return { refused: 'That stop is already removed.' };
  if (window === 'load') return { window, patch: { removed: true, removedAt: at, removedBy: by } };

  const removedReason = reason?.trim();
  if (!removedReason) return { refused: 'Say why the signs can’t go up.' };
  if (stopProgress(stop).placement.state === 'done') {
    return { refused: 'Its signs are already up, so that stop can’t be removed.' };
  }
  return { window, patch: { removed: true, removedAt: at, removedBy: by, removedReason } };
}

export interface StopRestorePatch {
  removed: false;
}

/**
 * Puts a removed Stop back. An Operator can restore a Stop removed at the
 * yard until Load is confirmed, and one removed at the door until Placement
 * is completed -- never one removed at the yard once Load is confirmed, as
 * its signs aren't on the van. `anyPhase` is an administrator's restore,
 * allowed at any time.
 */
/**
 * Whether a Removed Stop can still be restored: not once the Route is
 * finalised, as its Billed Time and invoice are worked out from its Stops.
 */
export function canRestoreRemovedStops(route: Pick<LoadChangeRoute, 'status'>): boolean {
  return route.status !== 'completed' && route.status !== 'archived';
}

export function planStopRestore(
  route: LoadChangeRoute,
  stop: Pick<Stop, 'removed' | 'removedReason'>,
  { anyPhase = false }: { anyPhase?: boolean } = {}
): { window: RemovalWindow | null; patch: StopRestorePatch } | { refused: string } {
  if (!canRestoreRemovedStops(route)) return { refused: ROUTE_FINALISED };
  const window = removalWindow(route);
  if (!anyPhase) {
    if (!window) return { refused: OUTSIDE_WINDOW };
    if (window === 'placement' && isStopRemoved(stop) && !isRemovedAtDoor(stop)) {
      return { refused: 'Only an administrator can restore a stop removed at Load.' };
    }
  }
  if (!isStopRemoved(stop)) return { refused: 'That stop is not removed.' };
  return { window, patch: { removed: false } };
}

/** What the Operator enters to add a property. Timed and blank signs follow from
 *  the sign count and whether it's an auction (lib/signRunTotals.ts timedSigns). */
export interface LoadStopInput {
  address: string;
  agent: string;
  numberOfSigns: number;
  isAuction: boolean;
}

export interface NewLoadStop {
  id: string;
  routeId: string;
  customerId: string;
  sequence: number;
  address: string;
  agent: string;
  numberOfSigns: number;
  isAuction: boolean;
  addedAtLoad: string;
}

/**
 * A new Stop at the end of the order. The address has to name its suburb,
 * so the Stop has a Property even if it can't be found on the map — checked
 * here, from the text alone, so it holds offline.
 */
export function planStopAddition(
  route: LoadChangeRoute,
  stops: Array<Pick<Stop, 'sequence'>>,
  input: LoadStopInput,
  id: string,
  at: string
): { stop: NewLoadStop } | { refused: string } {
  if (!isLoadChangeOpen(route)) return { refused: OUTSIDE_LOAD };
  const address = input.address.trim();
  const agent = input.agent.trim();
  if (!address) return { refused: 'Enter the address.' };
  if (!agent) return { refused: 'Pick the agent.' };
  if (!Number.isInteger(input.numberOfSigns) || input.numberOfSigns < 1) {
    return { refused: 'A property needs at least one sign.' };
  }
  if (!stopPropertyKey(address, {})) return { refused: LOAD_STOP_NEEDS_SUBURB };

  const lastSequence = stops.reduce((max, stop) => Math.max(max, stop.sequence ?? 0), 0);
  return {
    stop: {
      id,
      routeId: route.id,
      customerId: route.customerId,
      sequence: lastSequence + 1,
      address,
      agent,
      numberOfSigns: input.numberOfSigns,
      isAuction: input.isAuction,
      addedAtLoad: at,
    },
  };
}
