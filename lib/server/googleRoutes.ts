import { readRoadLegs, type EstimatePoint, type RoadLeg } from '@/lib/routeEstimate';

const COMPUTE_ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const TIMEOUT_MS = 15000;

export const ROUTES_KEY_MISSING =
  'Route Estimates are not set up yet: the Google Routes API key is missing. Run scripts/setup-routes-api-key.sh.';

const waypoint = ({ latitude, longitude }: EstimatePoint) => ({ location: { latLng: { latitude, longitude } } });

/**
 * Road distance for each Leg of a drive through `points` (first to last, in
 * order), from the Google Routes API. Traffic-unaware: the estimate is a
 * distance, not a prediction. Uses GOOGLE_ROUTES_API_KEY, a key restricted to
 * the Routes API alone -- the browser Maps key is referrer-restricted and the
 * Routes API rejects it. Throws with a message fit to show an administrator.
 */
export async function computeRoadLegs(points: EstimatePoint[]): Promise<RoadLeg[]> {
  const apiKey = process.env.GOOGLE_ROUTES_API_KEY;
  if (!apiKey) throw new Error(ROUTES_KEY_MISSING);

  const response = await fetch(COMPUTE_ROUTES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.legs.distanceMeters,routes.legs.polyline.encodedPolyline',
    },
    body: JSON.stringify({
      origin: waypoint(points[0]),
      destination: waypoint(points[points.length - 1]),
      intermediates: points.slice(1, -1).map(waypoint),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const reason = typeof payload?.error?.message === 'string' ? payload.error.message : `status ${response.status}`;
    throw new Error(`Google Routes could not calculate the drive: ${reason}`);
  }
  return readRoadLegs(payload ?? {}, points.length - 1);
}
