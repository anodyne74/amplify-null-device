/**
 * Load Change (see CONTEXT.md) — an Operator adding a Stop to, or removing a
 * Stop from, their Route during Load. The one place that decides whether a
 * Load Change is allowed and what it writes, and the one place that knows a
 * Stop is removed.
 *
 * - A removed Stop is kept, marked removed (Stop.removed, with removedAt and
 *   removedBy), and counts toward nothing: every count and list reads through
 *   activeStops(). Restoring sets removed back to false; nothing is ever
 *   cleared to null (operators can't delete Stops, and an update to null needs
 *   that permission).
 * - An added Stop is a delivery Stop at the end of the order, stamped
 *   addedAtLoad.
 *
 * Pure: queueLoadChange (lib/signRunTransitions.ts) applies a plan on the
 * operator's device and saves it through the Sign Run outbox, audited once it
 * saves. An administrator's restore reuses the plan but saves straight away
 * (lib/administratorRouteActions.ts).
 */
import { getSignRunPhase } from './signRunPhase';
import { stopPropertyKey } from './propertyKey';
import type { Route, Stop } from '../amplify/types';

export function isStopRemoved(stop: { removed?: boolean | null }): boolean {
  return stop.removed === true;
}

/** The Stops that count: every one a Load Change hasn't removed. */
export function activeStops<T extends { removed?: boolean | null }>(stops: T[]): T[] {
  return stops.filter((stop) => !isStopRemoved(stop));
}

/** Whether a Route has had a Load Change: a Stop added at Load, or one ever removed. */
export function hasLoadChanges(stops: Array<Pick<Stop, 'addedAtLoad' | 'removedAt'>>): boolean {
  return stops.some((stop) => Boolean(stop.addedAtLoad || stop.removedAt));
}

/** The Route fields the Load window reads. */
export type LoadChangeRoute = Pick<
  Route,
  'id' | 'customerId' | 'status' | 'executionPhase' | 'loadStartedAt' | 'loadConfirmedAt' | 'unloadConfirmedAt'
>;

/** Whether an Operator can make a Load Change: Load started and not yet confirmed. */
export function isLoadChangeOpen(route: Omit<LoadChangeRoute, 'id' | 'customerId'>): boolean {
  const phase = getSignRunPhase(route, 0);
  return phase?.phaseIdx === 0 && Boolean(route.loadStartedAt) && !route.loadConfirmedAt;
}

const OUTSIDE_LOAD = 'Stops can only be added or removed between starting and confirming Load.';

export const LOAD_STOP_NEEDS_SUBURB = 'Add the suburb to the address, e.g. "30 Faraday St, Carlton".';

export interface StopRemovalPatch {
  removed: true;
  removedAt: string;
  removedBy: string;
}

export function planStopRemoval(
  route: LoadChangeRoute,
  stop: Pick<Stop, 'removed'>,
  by: string,
  at: string
): { patch: StopRemovalPatch } | { refused: string } {
  if (!isLoadChangeOpen(route)) return { refused: OUTSIDE_LOAD };
  if (isStopRemoved(stop)) return { refused: 'That stop is already removed.' };
  return { patch: { removed: true, removedAt: at, removedBy: by } };
}

export interface StopRestorePatch {
  removed: false;
}

/** Puts a removed Stop back. `anyPhase` is an administrator's restore, allowed at any time. */
export function planStopRestore(
  route: LoadChangeRoute,
  stop: Pick<Stop, 'removed'>,
  { anyPhase = false }: { anyPhase?: boolean } = {}
): { patch: StopRestorePatch } | { refused: string } {
  if (!anyPhase && !isLoadChangeOpen(route)) return { refused: OUTSIDE_LOAD };
  if (!isStopRemoved(stop)) return { refused: 'That stop is not removed.' };
  return { patch: { removed: false } };
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
