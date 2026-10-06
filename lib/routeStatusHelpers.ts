import { getRoutePhaseKey, ROUTE_PHASE_LABELS, type RoutePhaseInput, type RoutePhaseKey } from '@/lib/signRunPhase';

export type RouteStatusPresentation = {
  badgeKey: RoutePhaseKey;
  label: string;
};

/**
 * Badge presentation (which of the 6 phases, plus a display label) for a
 * route — thin wrapper around getRoutePhaseKey/ROUTE_PHASE_LABELS, the
 * single source of truth for phase display (see lib/signRunPhase.ts).
 * Archived routes present identically to completed ones (soft-deprecated
 * status, folded into the same badge).
 */
export function getRouteStatusPresentation(route: RoutePhaseInput): RouteStatusPresentation {
  const badgeKey = getRoutePhaseKey(route);
  return { badgeKey, label: ROUTE_PHASE_LABELS[badgeKey].toLowerCase() };
}
