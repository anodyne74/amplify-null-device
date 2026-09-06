import type { Route } from '@/amplify/types';
import { getRoutePhaseKey, ROUTE_PHASE_KEYS } from '@/lib/signRunPhase';
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

export function compareRouteStatusAsc(a: Route, b: Route) {
  const aOrder = ROUTE_PHASE_KEYS.indexOf(getRoutePhaseKey(a));
  const bOrder = ROUTE_PHASE_KEYS.indexOf(getRoutePhaseKey(b));

  if (aOrder !== bOrder) {
    return aOrder - bOrder;
  }

  return compareRouteIdDesc(a, b);
}

export function formatEstimatedDurationMinutes(minutes?: number | null) {
  if (!minutes) return 'N/A';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}