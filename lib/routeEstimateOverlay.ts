/**
 * What the Route detail map draws for a Route Estimate (#516): the stored Leg
 * paths in order, and the home base. Reads the stored paths only, so viewing
 * the map never calls the Routes API.
 */

export type LatLng = [number, number];

export interface RouteEstimateOverlay {
  home: { latitude: number; longitude: number };
  /** One path per Leg, in Leg order, the return Leg last. */
  legs: LatLng[][];
}

/** Decodes a Google encoded polyline (precision 5) into [lat, lng] points. */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const nextDelta = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    lat += nextDelta();
    lng += nextDelta();
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

export function routeEstimateOverlay(
  estimate: {
    originLatitude: number;
    originLongitude: number;
    legs: ({ order: number; path?: string | null } | null | undefined)[];
  } | null
): RouteEstimateOverlay | null {
  if (!estimate) return null;
  const legs = estimate.legs
    .filter((leg): leg is NonNullable<typeof leg> => leg != null)
    .sort((a, b) => a.order - b.order)
    .map((leg) => decodePolyline(leg.path ?? ''))
    .filter((path) => path.length > 0);
  return { home: { latitude: estimate.originLatitude, longitude: estimate.originLongitude }, legs };
}
