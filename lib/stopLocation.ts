import { geocodeAddress } from './googleMaps';
import {
  stopLocationFields,
  stopLocationUpdate,
  type GeocodedLocation,
  type StopLocationFields,
  type StopLocationWrite,
} from './locationPrecision';
import { stopPropertyKey } from './propertyKey';
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

/** A Stop's location fields to write, and whether the Stop has a map pin once they're written. */
export interface StopLocation<F extends StopLocationWrite = StopLocationWrite> {
  fields: F;
  pinned: boolean;
}

/** Everything a geocode wrote about a Stop's old address, cleared -- no pin, precision or components. */
const NO_PIN: StopLocationWrite = {
  latitude: null,
  longitude: null,
  formattedAddress: null,
  locationPrecision: null,
  geocodeLocationType: null,
  geocodeResultTypes: null,
  geocodePartialMatch: null,
  addressStreetNumber: null,
  addressStreet: null,
  addressSuburb: null,
  addressPostcode: null,
};

/**
 * The geocode of a typed address, or null when it can't be geocoded: the Stop
 * is saved without a pin rather than not at all, keyed by its entered address
 * (CONTEXT.md "Location Precision").
 */
async function tryGeocode(address: string): Promise<GeocodedLocation | null> {
  try {
    return await geocodeAddress(address);
  } catch (error) {
    console.warn('Geocoding failed; the Stop is saved without a pin:', error);
    return null;
  }
}

/**
 * The fields with the Property's Confirmed pin in place of the geocode, when an
 * administrator has Confirmed one (#286). The Property key is the one the write
 * will build (stopPropertyKey), so a Stop with no geocode is looked up by its
 * entered address. A failed lookup fails the write.
 */
async function withConfirmedPin<F extends StopLocationWrite>(fields: F, address: string): Promise<StopLocation<F>> {
  const key = stopPropertyKey(address, fields);
  const confirmedPin = key ? await getConfirmedPin(key) : null;
  if (confirmedPin) return { fields: { ...fields, ...confirmedPin, locationPrecision: 'confirmed' }, pinned: true };
  return { fields, pinned: typeof fields.latitude === 'number' };
}

/** Location fields for a new Stop: the autocomplete pick, else a geocode of the typed address, else none. */
export async function locateNewStop(
  values: StopAddressInput
): Promise<StopLocation<Partial<Omit<StopLocationFields, 'propertyKey'>>>> {
  const geocoded = values.resolvedLocation ?? (await tryGeocode(values.address));
  return withConfirmedPin(geocoded ? stopLocationFields(geocoded) : {}, values.address);
}

/**
 * Location fields to write for an edited Stop. An unchanged address on a Stop
 * that already has coordinates isn't re-geocoded, so a flaky Maps call can't
 * touch an unrelated edit (#58). A changed address that can't be geocoded
 * loses the old address's pin. A Confirmed Stop is never moved
 * (stopLocationUpdate), though its Property key follows the new address.
 */
export async function locateEditedStop(original: LocatedStop | undefined, values: StopAddressInput): Promise<StopLocation> {
  const hasPin = typeof original?.latitude === 'number' && typeof original?.longitude === 'number';
  const addressUnchanged = original?.address?.trim() === values.address.trim();
  if (!values.resolvedLocation && addressUnchanged && hasPin) return { fields: {}, pinned: true };

  const confirmed = original?.locationPrecision === 'confirmed';
  const geocoded = values.resolvedLocation ?? (await tryGeocode(values.address));
  if (!geocoded) {
    if (confirmed) return { fields: {}, pinned: hasPin };
    return withConfirmedPin(addressUnchanged ? {} : NO_PIN, values.address);
  }

  const located = await withConfirmedPin(stopLocationUpdate(original, geocoded), values.address);
  return confirmed && hasPin ? { ...located, pinned: true } : located;
}
