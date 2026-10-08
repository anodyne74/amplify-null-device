/**
 * The pin on an Operator's home base: the start point of a Route Estimate
 * (see CONTEXT.md). Decides when the typed home base needs geocoding, and
 * turns a failed geocode into a warning rather than a failed save.
 */
import type { GeocodedLocation } from './locationPrecision';

export interface HomeBasePin {
  latitude: number;
  longitude: number;
}

export interface HomeBaseInput {
  text: string;
  /** What is stored on the Operator now. */
  saved: { text: string; pin: HomeBasePin | null };
}

export interface HomeBaseResult {
  /** null means the Operator is saved with no pin. */
  pin: HomeBasePin | null;
  warning?: string;
}

export const HOME_BASE_GEOCODE_WARNING =
  "Saved, but we couldn't find that home base on the map, so there is no start point set.";

export async function resolveHomeBasePin(
  { text, saved }: HomeBaseInput,
  geocode: (address: string) => Promise<GeocodedLocation>
): Promise<HomeBaseResult> {
  const address = text.trim();
  if (!address) return { pin: null };
  if (saved.pin && address === saved.text.trim()) return { pin: saved.pin };

  try {
    const { latitude, longitude } = await geocode(address);
    return { pin: { latitude, longitude } };
  } catch {
    return { pin: null, warning: HOME_BASE_GEOCODE_WARNING };
  }
}
