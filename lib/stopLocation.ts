import { geocodeAddress } from './googleMaps';
import {
  stopLocationFields,
  stopLocationUpdate,
  type GeocodedLocation,
  type StopLocationFields,
} from './locationPrecision';

/** The address part of a submitted StopForm: the typed address and, if picked from autocomplete, its geocode. */
export interface StopAddressInput {
  address: string;
  resolvedLocation?: GeocodedLocation | null;
}

export interface LocatedStop {
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationPrecision?: string | null;
}

/** Location fields for a new Stop: the autocomplete pick, else a geocode of the typed address. */
export async function locateNewStop(values: StopAddressInput): Promise<StopLocationFields> {
  return stopLocationFields(values.resolvedLocation ?? (await geocodeAddress(values.address)));
}

/**
 * Location fields to write for an edited Stop. An unchanged address on a Stop
 * that already has coordinates isn't re-geocoded, so a flaky Maps call can't
 * fail an unrelated edit (#58). A Confirmed Stop is never moved (stopLocationUpdate).
 */
export async function locateEditedStop(
  original: LocatedStop | undefined,
  values: StopAddressInput
): Promise<Partial<StopLocationFields>> {
  if (values.resolvedLocation) return stopLocationUpdate(original, values.resolvedLocation);

  const addressUnchanged = original?.address?.trim() === values.address.trim();
  if (addressUnchanged && typeof original?.latitude === 'number' && typeof original?.longitude === 'number') {
    return {};
  }
  return stopLocationUpdate(original, await geocodeAddress(values.address));
}
