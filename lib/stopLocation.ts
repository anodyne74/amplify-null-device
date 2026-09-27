import { geocodeAddress } from './googleMaps';
import {
  stopLocationFields,
  stopLocationUpdate,
  type GeocodedLocation,
  type StopLocationFields,
} from './locationPrecision';
import { propertyKey } from './propertyKey';
import { getConfirmedPin } from './propertyLocations';

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

/**
 * The fields plus the Property key for the entered address, when there's enough
 * to build one (#287) -- and, when an administrator has Confirmed that
 * Property's pin (#286), that pin in place of the geocode.
 */
async function withProperty<T extends Partial<StopLocationFields>>(
  fields: T,
  address: string,
  geocoded: GeocodedLocation
): Promise<T> {
  const key = propertyKey(address, geocoded.addressComponents ?? {});
  if (!key) return fields;

  const confirmedPin = await getConfirmedPin(key);
  return confirmedPin
    ? { ...fields, propertyKey: key, ...confirmedPin, locationPrecision: 'confirmed' }
    : { ...fields, propertyKey: key };
}

/** Location fields for a new Stop: the autocomplete pick, else a geocode of the typed address. */
export async function locateNewStop(values: StopAddressInput): Promise<StopLocationFields> {
  const geocoded = values.resolvedLocation ?? (await geocodeAddress(values.address));
  return withProperty(stopLocationFields(geocoded), values.address, geocoded);
}

/**
 * Location fields to write for an edited Stop. An unchanged address on a Stop
 * that already has coordinates isn't re-geocoded, so a flaky Maps call can't
 * fail an unrelated edit (#58). A Confirmed Stop is never moved (stopLocationUpdate),
 * but its Property key follows the new address.
 */
export async function locateEditedStop(
  original: LocatedStop | undefined,
  values: StopAddressInput
): Promise<Partial<StopLocationFields>> {
  if (values.resolvedLocation) {
    return withProperty(stopLocationUpdate(original, values.resolvedLocation), values.address, values.resolvedLocation);
  }

  const addressUnchanged = original?.address?.trim() === values.address.trim();
  if (addressUnchanged && typeof original?.latitude === 'number' && typeof original?.longitude === 'number') {
    return {};
  }
  const geocoded = await geocodeAddress(values.address);
  return withProperty(stopLocationUpdate(original, geocoded), values.address, geocoded);
}
