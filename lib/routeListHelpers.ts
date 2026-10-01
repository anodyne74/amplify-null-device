import type { Route } from '@/amplify/types';
import { billedTime } from '@/lib/billedTime';
import { getRouteDurationMinutes } from '@/lib/routeDetailHelpers';
export { formatRouteDate } from '@/lib/routeDetailHelpers';

export function formatRouteDuration(route: Route) {
  const minutes = getRouteDurationMinutes(route);
  if (minutes === null) return '—';

  // getRouteDurationMinutes only falls through to its live elapsed-time
  // estimate for in-progress routes with no Billed Time yet — that's the one
  // case worth labelling, so callers know the number is still moving rather
  // than settled.
  const isLiveEstimate = route.status === 'in_progress' && billedTime(route).totalMinutes === null;

  return isLiveEstimate ? `${minutes} min (in progress)` : `${minutes} min`;
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
