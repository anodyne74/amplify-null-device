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

/**
 * Whether a Stop would have no Property: no map pin, and an address that names
 * no suburb, so no Property key can be built (stopPropertyKey). Such a Stop
 * would be missing from Property History and Location review, so it isn't
 * saved (lib/routes.ts STOP_NEEDS_SUBURB).
 */
export function lacksProperty(address: string, location: StopLocation): boolean {
  return !location.pinned && !stopPropertyKey(address, location.fields);
}

/** Pause between geocodes when locating a batch, to stay under the Maps rate limit. */
const BATCH_GEOCODE_DELAY_MS = 200;

/**
 * Locate a batch of draft Stops, such as a parsed schedule file, one at a time
 * (Maps rate-limits bursts), the same way a hand-added Stop is located. A draft
 * that can't be located, including when its Confirmed-pin lookup fails, stays
 * without a pin rather than failing the batch; it is still keyed to its
 * Property when written -- unless its address names no suburb (lacksProperty),
 * when it is left out and its address returned in `leftOut`. `onProgress` is
 * called after each draft.
 */
export async function locateDraftStops<S extends StopAddressInput>(
  drafts: S[],
  onProgress?: (located: number, total: number) => void,
  delayMs = BATCH_GEOCODE_DELAY_MS
): Promise<{ stops: Array<S & StopLocation['fields']>; unpinned: number; leftOut: string[] }> {
  const stops: Array<S & StopLocation['fields']> = [];
  const leftOut: string[] = [];
  let unpinned = 0;
  for (const [index, draft] of drafts.entries()) {
    if (index > 0 && delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const location = await locateNewStop(draft).catch((error) => {
      console.warn('Could not locate a draft Stop; it is added without a pin:', error);
      return { fields: {}, pinned: false };
    });
    if (lacksProperty(draft.address, location)) {
      leftOut.push(draft.address);
    } else {
      stops.push({ ...draft, ...location.fields });
      if (!location.pinned) unpinned += 1;
    }
    onProgress?.(index + 1, drafts.length);
  }
  return { stops, unpinned, leftOut };
}
