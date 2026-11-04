import type { Route, Stop } from '@/amplify/types';
import { billedTime } from '@/lib/billedTime';
import { getRouteDurationMinutes } from '@/lib/routeDetailHelpers';
import { getRoutePhaseKey, ROUTE_PHASE_KEYS, type RoutePhaseInput } from '@/lib/signRunPhase';
export { formatRouteDate } from '@/lib/routeDetailHelpers';

export function formatRouteDuration(route: Route) {
  const minutes = getRouteDurationMinutes(route);
  if (minutes === null) return '—';

  // getRouteDurationMinutes only falls through to measured phase time for
  // routes with no Billed Time yet; on an in-progress route that number grows
  // as each phase finishes, so it's labelled rather than shown as settled.
  const stillMeasuring = route.status === 'in_progress' && billedTime(route).totalMinutes === null;

  return stillMeasuring ? `${minutes} min (in progress)` : `${minutes} min`;
}

// Route codes are formatted W{week}-{year}-{sequence}, e.g. "W48-23-001" — week
// comes before year, so a plain (even numeric-aware) string compare sorts "W48-23-001"
// after "W02-24-001", putting week 48 of 2023 chronologically later than week 2 of
// 2024. Parsing out year/week/sequence and comparing in that order fixes it.
const ROUTE_CODE_SORT_RE = /^W(\d{2})-(\d{2})-(\d{3})$/i;

function routeCodeSortKey(code: string | null | undefined): number | null {
  if (!code) return null;
  const match = code.trim().match(ROUTE_CODE_SORT_RE);
  if (!match) return null;
  const [, week, year, sequence] = match;
  return Number(year) * 100000 + Number(week) * 1000 + Number(sequence);
}

export function compareRouteIdDesc(a: Route, b: Route) {
  const aKey = routeCodeSortKey(a.routeCode);
  const bKey = routeCodeSortKey(b.routeCode);

  if (aKey !== null && bKey !== null) {
    return bKey - aKey;
  }

  const aId = (a.routeCode || a.id || '').trim();
  const bId = (b.routeCode || b.id || '').trim();
  return bId.localeCompare(aId, undefined, { numeric: true, sensitivity: 'base' });
}

/** The administrator Routes list's default order: latest Placement Date first, Routes with no
 * Placement Date last, ties by Route Code as before. */
export function comparePlacementDateDesc(a: Route, b: Route) {
  const aDate = a.scheduledDate || '';
  const bDate = b.scheduledDate || '';
  if (aDate !== bDate) {
    if (!aDate) return 1;
    if (!bDate) return -1;
    return aDate < bDate ? 1 : -1;
  }
  return compareRouteIdDesc(a, b);
}

/** Today as a local YYYY-MM-DD, the same shape as `pickupDate`. */
export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** A Route is overdue when its Pickup Date has passed and it isn't finished (by Route Phase, as the rest
 * of the app judges it). A Route with no Pickup Date can't be overdue. */
export function routePickupOverdue(route: Route, today: string) {
  if (!route.pickupDate || route.pickupDate >= today) return false;
  return getRoutePhaseKey(route as unknown as RoutePhaseInput) !== 'completed';
}

export function routeUnassigned(route: Route) {
  return !route.assignedOperatorName && !route.assignedOperatorEmail;
}

/** Whether an administrator has something to do about a Route: nobody is assigned as Operator, or it is
 * overdue. A finished Route never needs attention. `today` is a local YYYY-MM-DD. */
export function routeNeedsAttention(route: Route, today: string) {
  if (getRoutePhaseKey(route as unknown as RoutePhaseInput) === 'completed') return false;
  return routeUnassigned(route) || routePickupOverdue(route, today);
}

/** The rule behind Needs attention, in the words the Routes list shows beside it. */
export const NEEDS_ATTENTION_RULE = 'No Operator assigned, or Pickup Date passed and Route not finished';

/** What assigning one Operator to a set of selected Routes will do. A finished Route is left alone, and
 * so is one that already has this Operator; `overwrites` are the eligible Routes whose current Operator
 * would be replaced, so the administrator can be told before it happens. */
export function planOperatorAssignment(routes: Route[], operatorSub: string) {
  const finished: Route[] = [];
  const alreadyAssigned: Route[] = [];
  const eligible: Route[] = [];
  for (const route of routes) {
    if (getRoutePhaseKey(route as unknown as RoutePhaseInput) === 'completed') finished.push(route);
    else if (route.assignedOperatorSub === operatorSub) alreadyAssigned.push(route);
    else eligible.push(route);
  }
  const overwrites = eligible.filter((route) => !routeUnassigned(route));
  return { eligible, finished, alreadyAssigned, overwrites };
}

export function routeLabel(route: Pick<Route, 'id' | 'routeCode'>) {
  return route.routeCode || route.id.slice(0, 8);
}

export type RouteSortKey = 'placementDate' | 'pickupDate' | 'customer' | 'status';
export type RouteSortDirection = 'asc' | 'desc';

/** Orders Routes for a clicked column header. A Route with nothing to sort on (no date) goes last in
 * either direction, so flipping the direction never buries the dated Routes. Ties fall back to the
 * default order. Status follows the Sign Run flow (Load, Placement, ...), not the alphabet. */
export function compareRoutesBy(
  key: RouteSortKey,
  direction: RouteSortDirection,
  customersById: Record<string, string>
) {
  const sign = direction === 'asc' ? 1 : -1;
  return (a: Route, b: Route) => {
    let result = 0;
    if (key === 'placementDate' || key === 'pickupDate') {
      const field = key === 'placementDate' ? 'scheduledDate' : 'pickupDate';
      const aDate = a[field] || '';
      const bDate = b[field] || '';
      if (aDate !== bDate) {
        if (!aDate) return 1;
        if (!bDate) return -1;
        result = aDate < bDate ? -1 : 1;
      }
    } else if (key === 'customer') {
      result = (customersById[a.customerId] || '').localeCompare(customersById[b.customerId] || '', undefined, {
        sensitivity: 'base',
      });
    } else {
      const phase = (route: Route) => ROUTE_PHASE_KEYS.indexOf(getRoutePhaseKey(route as unknown as RoutePhaseInput));
      result = phase(a) - phase(b);
    }
    return result !== 0 ? result * sign : comparePlacementDateDesc(a, b);
  };
}

export function formatEstimatedDurationMinutes(minutes?: number | null) {
  if (!minutes) return 'N/A';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export interface RouteStopTotals {
  stops: number;
  signs: number;
}

/** Stops and Signs per Route for the Routes list. The caller passes Stops that
 * count (Removed Stops already left out, see listAllStops). A Route with no
 * Stops has no entry. */
export function summariseStopsByRoute(stops: Pick<Stop, 'routeId' | 'numberOfSigns'>[]): Map<string, RouteStopTotals> {
  const totals = new Map<string, RouteStopTotals>();
  for (const stop of stops) {
    if (!stop.routeId) continue;
    const entry = totals.get(stop.routeId) ?? { stops: 0, signs: 0 };
    entry.stops += 1;
    entry.signs += stop.numberOfSigns ?? 0;
    totals.set(stop.routeId, entry);
  }
  return totals;
}

/** "12 stops · 31 signs", singular where it is 1; "No stops yet" for a Route with none. */
export function formatStopTotals(totals: RouteStopTotals | undefined): string {
  if (!totals) return 'No stops yet';
  const stops = `${totals.stops} ${totals.stops === 1 ? 'stop' : 'stops'}`;
  const signs = `${totals.signs} ${totals.signs === 1 ? 'sign' : 'signs'}`;
  return `${stops} · ${signs}`;
}
