/**
 * Read-only route-detail derived state shared by the administrator and
 * operator route detail pages: where a route sits in its phase track, and
 * the stop/sign/distance/duration counts shown in each page's summary strip.
 * Pure and side-effect free, same style as lib/routeDetailHelpers.ts /
 * lib/signRunPhase.ts.
 *
 * Deliberately does not blend in either page's override precedence (admin's
 * fuller billing-override defaults, operator's distance-override preview) --
 * those differ enough in shape between the two pages that each keeps its own
 * on top of the raw stats returned here.
 */
import type { Route, Stop } from '@/amplify/types';
import { getSignRunPhase, ROUTE_PHASE_KEYS, ROUTE_PHASE_LABELS, type RoutePhaseInput, type SignRunTrackState } from './signRunPhase';
import { calculateRouteDistanceKm, getRouteDurationMinutes } from './routeDetailHelpers';
import { signsCollected } from './signRunTotals';

export interface PhaseOverview {
  track: readonly SignRunTrackState[];
  caption: string;
  /** getSignRunPhase's 0-4 work-phase index, for callers that link to the
   *  active phase screen (e.g. operator's PHASE_SCREEN_HREF). null once the
   *  route is completed/archived -- there's no active phase left to link to. */
  phaseIdx: number | null;
}

/**
 * Read-only phase overview for a route's 6-phase lifecycle track. Phase
 * advancement itself happens exclusively on the operator sign-run screens
 * (Load/Placement/Pickup/Unload/Finalise) -- this is a summary, not a
 * transition control. Completed/archived routes always render as fully
 * done -- archived is a legacy status with no presentation of its own (see
 * lib/signRunPhase.ts).
 */
export function getPhaseOverview(route: RoutePhaseInput | null, stops: Stop[]): PhaseOverview | null {
  if (!route) return null;
  if (route.status === 'completed' || route.status === 'archived') {
    return { track: ['done', 'done', 'done', 'done', 'done', 'done'], caption: ROUTE_PHASE_LABELS.completed, phaseIdx: null };
  }
  const info = getSignRunPhase(route, stops.length);
  if (!info) return null;
  const currentIdx = info.overallTrack.indexOf('current');
  const idx = currentIdx === -1 ? info.overallTrack.length - 1 : currentIdx;
  return {
    track: info.overallTrack,
    caption: `${ROUTE_PHASE_LABELS[ROUTE_PHASE_KEYS[idx]]} · Phase ${idx + 1} of 6`,
    phaseIdx: info.phaseIdx,
  };
}

/** A stop is "completed" once it has an actual departure time recorded. */
export function isStopCompleted(stop: Stop) {
  return Boolean(stop.actualDepartureTime);
}

export interface RouteSummaryStats {
  routeDurationMinutes: number | null;
  kilometersTravelled: number;
  totalStops: number;
  totalSigns: number;
}

/**
 * Duration/distance/stop/sign counts for a route's summary strip. Completed
 * and archived routes summarise only their completed stops, falling back to
 * every stop when none are marked complete (e.g. legacy-imported routes that
 * never wrote actualDepartureTime) -- in-progress and planned routes always
 * summarise every stop regardless of completion.
 */
export function computeRouteSummaryStats(route: Route | null, stops: Stop[]): RouteSummaryStats {
  const completedStops = stops.filter((stop) => isStopCompleted(stop));
  const summaryStops =
    route?.status === 'completed' || route?.status === 'archived'
      ? completedStops.length > 0
        ? completedStops
        : stops
      : stops;

  return {
    routeDurationMinutes: route ? getRouteDurationMinutes(route) : null,
    kilometersTravelled: calculateRouteDistanceKm(summaryStops),
    totalStops: summaryStops.length,
    totalSigns: signsCollected(summaryStops),
  };
}
