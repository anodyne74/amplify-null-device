import type { Route } from '@/amplify/types';
export { formatRouteDate } from '@/lib/routeDetailHelpers';

type SortableRouteStatus =
  | 'planned'
  | 'in_progress'
  | 'signs_placed'
  | 'signs_picked_up'
  | 'completed'
  | 'archived';

const routeStatusSortOrder: Record<SortableRouteStatus, number> = {
  planned: 0,
  in_progress: 1,
  signs_placed: 2,
  signs_picked_up: 3,
  completed: 4,
  archived: 5,
};

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
  const aOrder = routeStatusSortOrder[(a.status as SortableRouteStatus) ?? 'planned'] ?? 0;
  const bOrder = routeStatusSortOrder[(b.status as SortableRouteStatus) ?? 'planned'] ?? 0;

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