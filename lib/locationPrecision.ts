/**
 * Location Precision (CONTEXT.md, docs/adr/0004-property-identity-is-the-address-not-the-geocode.md):
 * how well a Stop's pin matches the real address. Classified from Google's
 * geocode signals whenever a Stop is geocoded; Confirmed is only ever set by
 * hand and no automatic geocode overwrites it.
 *
 * scripts/ (the geocode backfill's assess mode, #284) mirrors
 * classifyLocationPrecision and parseAddressComponents -- keep them in step.
 */

export type LocationPrecision = 'precise' | 'interpolated' | 'approximate' | 'confirmed';

/** What an automatic geocode can produce -- never Confirmed. */
export type GeocodedPrecision = Exclude<LocationPrecision, 'confirmed'>;

export interface GeocodeSignals {
  /** geometry.location_type: ROOFTOP, RANGE_INTERPOLATED, GEOMETRIC_CENTER or APPROXIMATE. */
  locationType?: string | null;
  /** The top result's types, e.g. ['street_address'] or ['route']. */
  resultTypes?: string[] | null;
  partialMatch?: boolean | null;
  streetNumber?: string | null;
}

export interface AddressComponents {
  streetNumber?: string;
  street?: string;
  suburb?: string;
  postcode?: string;
}

/** Google's address_components entry, as both the REST API and the JS Geocoder return it. */
export interface GoogleAddressComponent {
  long_name?: string;
  short_name?: string;
  types?: string[];
}

/** A geocoded address. The precision fields are absent when the source gave none. */
export interface GeocodedLocation {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  locationPrecision?: GeocodedPrecision;
  locationType?: string;
  resultTypes?: string[];
  partialMatch?: boolean;
  addressComponents?: AddressComponents;
}

const APPROXIMATE_RESULT_TYPES = ['route', 'locality'];

export function classifyLocationPrecision(signals: GeocodeSignals): GeocodedPrecision {
  const topType = signals.resultTypes?.[0];
  if (signals.partialMatch || (topType && APPROXIMATE_RESULT_TYPES.includes(topType))) {
    return 'approximate';
  }
  if (signals.locationType === 'ROOFTOP' && signals.streetNumber) return 'precise';
  if (signals.locationType === 'RANGE_INTERPOLATED') return 'interpolated';
  return 'approximate';
}

const COMPONENT_TYPES: Record<keyof AddressComponents, string> = {
  streetNumber: 'street_number',
  street: 'route',
  suburb: 'locality',
  postcode: 'postal_code',
};

export function parseAddressComponents(components: readonly GoogleAddressComponent[] | null | undefined): AddressComponents {
  const parsed: AddressComponents = {};
  for (const [key, type] of Object.entries(COMPONENT_TYPES) as [keyof AddressComponents, string][]) {
    const value = components?.find((component) => component.types?.includes(type))?.long_name;
    if (value) parsed[key] = value;
  }
  return parsed;
}

/** The Stop fields a geocode fills in. */
export interface StopLocationFields {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  /** Confirmed only when copied from a Stop that was confirmed by hand; a geocode never produces it. */
  locationPrecision?: LocationPrecision;
  geocodeLocationType?: string;
  geocodeResultTypes?: string[];
  geocodePartialMatch?: boolean;
  addressStreetNumber?: string;
  addressStreet?: string;
  addressSuburb?: string;
  addressPostcode?: string;
}

const STOP_LOCATION_FIELD_NAMES = [
  'latitude',
  'longitude',
  'formattedAddress',
  'locationPrecision',
  'geocodeLocationType',
  'geocodeResultTypes',
  'geocodePartialMatch',
  'addressStreetNumber',
  'addressStreet',
  'addressSuburb',
  'addressPostcode',
] as const satisfies readonly (keyof StopLocationFields)[];

/** Just the Stop location fields of `source` that are set (not null/undefined), e.g. to copy a Stop's pin and precision onto a new Stop. */
export function pickStopLocationFields(
  source: Partial<Record<keyof StopLocationFields, unknown>>
): Partial<StopLocationFields> {
  const picked: Record<string, unknown> = {};
  for (const name of STOP_LOCATION_FIELD_NAMES) {
    if (source[name] != null) picked[name] = source[name];
  }
  return picked as Partial<StopLocationFields>;
}

type StopAddressFields = Pick<
  StopLocationFields,
  'addressStreetNumber' | 'addressStreet' | 'addressSuburb' | 'addressPostcode'
>;

function stopAddressFields(components: AddressComponents | undefined): StopAddressFields {
  const fields: StopAddressFields = {};
  if (components?.streetNumber) fields.addressStreetNumber = components.streetNumber;
  if (components?.street) fields.addressStreet = components.street;
  if (components?.suburb) fields.addressSuburb = components.suburb;
  if (components?.postcode) fields.addressPostcode = components.postcode;
  return fields;
}

export function stopLocationFields(geocoded: GeocodedLocation): StopLocationFields {
  const fields: StopLocationFields = {
    latitude: geocoded.latitude,
    longitude: geocoded.longitude,
    formattedAddress: geocoded.formattedAddress,
  };
  if (!geocoded.locationPrecision) return fields;
  return {
    ...fields,
    locationPrecision: geocoded.locationPrecision,
    geocodeLocationType: geocoded.locationType,
    geocodeResultTypes: geocoded.resultTypes,
    geocodePartialMatch: geocoded.partialMatch,
    ...stopAddressFields(geocoded.addressComponents),
  };
}

/**
 * The fields to write when an existing Stop is re-geocoded. A Confirmed Stop
 * keeps its pin, formatted address and precision; only the address components
 * (which describe the entered address, not the pin) are refreshed.
 */
export function stopLocationUpdate(
  existing: { locationPrecision?: string | null } | undefined,
  geocoded: GeocodedLocation
): Partial<StopLocationFields> {
  if (existing?.locationPrecision === 'confirmed') return stopAddressFields(geocoded.addressComponents);
  return stopLocationFields(geocoded);
}

export interface LocationPrecisionIndicator {
  /** Interpolated is flagged subtly, Approximate clearly (#283). */
  level: 'subtle' | 'clear';
  label: string;
}

/** How a map marks a Stop's pin; null when the pin can be trusted (Precise or Confirmed). */
export function locationPrecisionIndicator(
  precision: string | null | undefined
): LocationPrecisionIndicator | null {
  if (precision === 'interpolated') return { level: 'subtle', label: 'Interpolated location' };
  if (precision === 'approximate') return { level: 'clear', label: 'Approximate location' };
  return null;
}
