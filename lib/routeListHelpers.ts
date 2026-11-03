import type { Route, Stop } from '@/amplify/types';
import { billedTime } from '@/lib/billedTime';
import { getRouteDurationMinutes } from '@/lib/routeDetailHelpers';
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

/** "12 stops · 31 signs", singular where it is 1. */
export function formatStopTotals(totals: RouteStopTotals | undefined): string {
  if (!totals) return '—';
  const stops = `${totals.stops} ${totals.stops === 1 ? 'stop' : 'stops'}`;
  const signs = `${totals.signs} ${totals.signs === 1 ? 'sign' : 'signs'}`;
  return `${stops} · ${signs}`;
}
