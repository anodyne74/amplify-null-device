import type { Route } from '@/amplify/types';
export { formatRouteDate } from '@/lib/routeDetailHelpers';

export function formatRouteDuration(route: Route) {
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

export function compareRouteIdDesc(a: Route, b: Route) {
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