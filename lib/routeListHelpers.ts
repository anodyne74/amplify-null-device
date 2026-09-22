import type { Route } from '@/amplify/types';
export { formatRouteDate } from '@/lib/routeDetailHelpers';

export function formatRouteDuration(route: Route) {
  if (typeof route.overrideDurationMinutes === 'number') {
    return `${route.overrideDurationMinutes} min`;
  }

  if (typeof route.actualDurationMinutes === 'number') {
    return `${route.actualDurationMinutes} min`;
  }

  if (route.status === 'in_progress' && route.actualStartTime) {
    const minutes = Math.max(
      1,
      Math.round((Date.now() - new Date(route.actualStartTime).getTime()) / 60000)
    );
    return `${minutes} min (in progress)`;
  }

  return '—';
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

// Operators can correct the measured duration/distance at finalisation (the
// same overrideDurationMinutes/overrideDistanceKm fields invoicing reads) —
// these mirror that fallback so customer-facing totals agree with billing.
export function getFinalizedRouteDurationMinutes(route: Route) {
  if (typeof route.overrideDurationMinutes === 'number') return route.overrideDurationMinutes;
  return typeof route.actualDurationMinutes === 'number' ? route.actualDurationMinutes : 0;
}

export function getFinalizedRouteDistanceKm(route: Route) {
  if (typeof route.overrideDistanceKm === 'number') return route.overrideDistanceKm;
  return (
    (typeof route.signsPlacedDistanceKm === 'number' ? route.signsPlacedDistanceKm : 0) +
    (typeof route.signsPickedUpDistanceKm === 'number' ? route.signsPickedUpDistanceKm : 0)
  );
}