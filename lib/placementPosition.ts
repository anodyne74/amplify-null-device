import { updateStopExecution } from './routes';

/**
 * Where the operator's device was when they marked a Stop placed (#285). The
 * operator is at the property then, so this is the best evidence of where the
 * house really is; the admin review queue (#286) offers it as a suggested pin.
 * It never moves the Stop's own map pin (latitude/longitude).
 */
export interface PlacementPosition {
  placedLatitude: number;
  placedLongitude: number;
  placedAccuracyMeters: number;
  placedPositionAt: string;
}

const POSITION_TIMEOUT_MS = 10000;
// The driving view already watches position, so a fix from the last half-minute is fresh enough.
const POSITION_MAX_AGE_MS = 30000;

/** A single best-effort position fix; null when geolocation is missing, denied, fails or times out. */
export function readDevicePosition(
  geolocation: Geolocation | undefined = typeof navigator !== 'undefined' ? navigator.geolocation : undefined,
  timeoutMs = POSITION_TIMEOUT_MS
): Promise<PlacementPosition | null> {
  if (!geolocation) return Promise.resolve(null);

  return new Promise((resolve) => {
    // Some browsers never call back when the permission prompt is ignored, so don't rely on
    // the API's own timeout alone.
    const giveUp = setTimeout(() => resolve(null), timeoutMs);
    geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(giveUp);
        resolve({
          placedLatitude: position.coords.latitude,
          placedLongitude: position.coords.longitude,
          placedAccuracyMeters: position.coords.accuracy,
          placedPositionAt: new Date(position.timestamp).toISOString(),
        });
      },
      () => {
        clearTimeout(giveUp);
        resolve(null);
      },
      { enableHighAccuracy: true, maximumAge: POSITION_MAX_AGE_MS, timeout: timeoutMs }
    );
  });
}

/**
 * Reads the device position and saves it on the Stop. Best-effort: resolves
 * the saved fields, or null if there was no position or the write failed --
 * it never throws, so placement never depends on it.
 */
export async function recordPlacementPosition(
  stopId: string,
  geolocation?: Geolocation
): Promise<PlacementPosition | null> {
  const position = await readDevicePosition(geolocation);
  if (!position) return null;

  try {
    const { errors } = await updateStopExecution(stopId, position);
    return errors && errors.length > 0 ? null : position;
  } catch {
    return null;
  }
}
