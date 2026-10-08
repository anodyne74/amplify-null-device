/**
 * Route Estimate planning (CONTEXT.md, ADR 0011): which points the drive
 * passes through, and reading Google's answer back into Legs. Pure, so the
 * rules are testable without the Routes API or the data client.
 */

export interface EstimatePoint {
  latitude: number;
  longitude: number;
}

export interface EstimateStop {
  id: string;
  sequence: number;
  latitude?: number | null;
  longitude?: number | null;
  removed?: boolean | null;
  formattedAddress?: string | null;
  address?: string | null;
}

export type RouteEstimatePlan =
  | {
      ok: true;
      /** Home base, each used Stop in sequence order, then home base again. */
      points: EstimatePoint[];
      stopIds: string[];
      leftOut: { noPin: number; removed: number };
    }
  | { ok: false; reason: string };

export interface RoadLeg {
  distanceMeters: number;
  /** Encoded polyline of the drive. */
  path: string;
}

function hasPin(stop: EstimateStop): stop is EstimateStop & EstimatePoint {
  return typeof stop.latitude === 'number' && typeof stop.longitude === 'number';
}

export function planRouteEstimate(
  route: { assignedOperatorSub?: string | null },
  operator: { homeBase: EstimatePoint | null } | null,
  stops: EstimateStop[]
): RouteEstimatePlan {
  if (!route.assignedOperatorSub) {
    return { ok: false, reason: 'This Route has no Operator, so there is no start point to estimate from.' };
  }
  if (!operator?.homeBase) {
    return {
      ok: false,
      reason: "The Operator has no start point. Save their home base on the Drivers screen to set one.",
    };
  }

  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence);
  const removed = ordered.filter((stop) => stop.removed).length;
  const live = ordered.filter((stop) => !stop.removed);
  const pinned = live.filter(hasPin);
  if (pinned.length === 0) {
    return { ok: false, reason: 'No Stop on this Route has a pin yet, so there is nothing to drive between.' };
  }

  const home = operator.homeBase;
  return {
    ok: true,
    points: [home, ...pinned.map(({ latitude, longitude }) => ({ latitude, longitude })), home],
    stopIds: pinned.map((stop) => stop.id),
    leftOut: { noPin: live.length - pinned.length, removed },
  };
}

interface RoutesApiResponse {
  routes?: { legs?: { distanceMeters?: number; polyline?: { encodedPolyline?: string } }[] }[];
}

/** Reads a Routes API computeRoutes answer into one RoadLeg per drive; throws if it is incomplete. */
export function readRoadLegs(response: RoutesApiResponse, expectedLegs: number): RoadLeg[] {
  const legs = response.routes?.[0]?.legs;
  if (!legs) throw new Error('Google returned no route for these points.');
  if (legs.length !== expectedLegs) {
    throw new Error(`Google returned ${legs.length} legs, expected ${expectedLegs}.`);
  }
  return legs.map((leg) => {
    if (typeof leg.distanceMeters !== 'number') throw new Error('Google returned a leg with no distance.');
    return { distanceMeters: leg.distanceMeters, path: leg.polyline?.encodedPolyline ?? '' };
  });
}
