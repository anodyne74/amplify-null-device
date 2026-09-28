/**
 * Property key (CONTEXT.md "Property", docs/adr/0004-property-identity-is-the-address-not-the-geocode.md):
 * the normalised street number + street + suburb + postcode that identifies a
 * Property, so every Stop at one address shares a key. Never built from
 * coordinates or a place ID -- a street-midpoint geocode must not merge the
 * houses on that street.
 *
 * Ordered suburb|postcode|street|number so one Customer-scoped index answers
 * suburb, street and exact-address searches by prefix (propertyKeyPrefix); the
 * delimiter keeps "Epping" from matching "North Epping".
 *
 * Callers never split a key themselves: parsePropertyKey, streetKeyOf,
 * comparePropertyKeys and the labels below are the only readers of its layout.
 *
 * scripts/backfill-geocodes.js mirrors propertyKey -- keep them in step;
 * scripts/__tests__/backfill-geocodes.test.ts checks both agree.
 */
import { titleCase } from './format';
import type { AddressComponents, StopLocationFields } from './locationPrecision';

const STREET_TYPES: Record<string, string> = {
  av: 'avenue',
  ave: 'avenue',
  bvd: 'boulevard',
  blvd: 'boulevard',
  cct: 'circuit',
  cl: 'close',
  cr: 'crescent',
  cres: 'crescent',
  ct: 'court',
  dr: 'drive',
  esp: 'esplanade',
  gr: 'grove',
  gve: 'grove',
  hwy: 'highway',
  ln: 'lane',
  pde: 'parade',
  pkwy: 'parkway',
  pl: 'place',
  rd: 'road',
  sq: 'square',
  st: 'street',
  tce: 'terrace',
};

const STATES = /\b(nsw|vic|qld|sa|wa|tas|nt|act)\b/g;

// An optional unit ("Unit 2, " / "2/"), then the street number ("14", "14A", "14-16"), then the street.
const STREET_NUMBER_AND_STREET =
  /^\s*(?:(?:unit|u|apt|apartment|shop|suite)\s*\d+[a-z]?\s*[,/]?\s*|\d+[a-z]?\s*\/\s*)?(\d+[a-z]?(?:-\d+[a-z]?)?)\s+([^,]+)/i;

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/[^a-z0-9-]+/g, ' ')
    .trim();
}

/** Lower-cased, punctuation-free, with the trailing street type spelled out ("Cliff Rd" -> "cliff road"). */
function normaliseStreet(street: string): string {
  const words = normalise(street).split(' ');
  const last = words.length - 1;
  words[last] = STREET_TYPES[words[last]] ?? words[last];
  return words.join(' ');
}

export function enteredStreetNumber(address: string): string | undefined {
  return address.match(STREET_NUMBER_AND_STREET)?.[1].toLowerCase();
}

function enteredStreet(address: string): string | undefined {
  return address.match(STREET_NUMBER_AND_STREET)?.[2];
}

/** The suburb named after the street, e.g. "Epping" in "14 Cliff Rd, Epping NSW 2121". */
function enteredSuburb(address: string): string | undefined {
  const segments = address.split(',').slice(1);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const suburb = normalise(segments[i]).replace(STATES, '').replace(/\b\d{4}\b/g, '').replace('australia', '').trim();
    if (suburb && !/^\d/.test(suburb)) return suburb.replace(/\s+/g, ' ');
  }
  return undefined;
}

function enteredPostcode(address: string): string | undefined {
  return address.match(/\b(\d{4})\s*(?:,?\s*australia)?\s*$/i)?.[1];
}

/**
 * The Property key for an entered address and its geocoded components, or
 * undefined when there's no street number, street and suburb to build it from.
 * The geocoder supplies the components; the entered address supplies the street
 * number when Google leaves it out, and its suburb always wins (with its
 * postcode -- the geocoder's postcode is only trusted for the geocoder's suburb).
 */
export function propertyKey(address: string, components: AddressComponents): string | undefined {
  const streetNumber = components.streetNumber?.toLowerCase() ?? enteredStreetNumber(address);
  const street = components.street ?? enteredStreet(address);
  const geocodedSuburb = components.suburb ? normalise(components.suburb) : undefined;
  const suburb = enteredSuburb(address) ?? geocodedSuburb;
  if (!streetNumber || !street || !suburb) return undefined;

  const postcode = enteredPostcode(address) ?? (geocodedSuburb === suburb ? components.postcode : undefined) ?? '';
  return [suburb, postcode, normaliseStreet(street), streetNumber].join('|');
}

/** A Stop's geocoded address components, as stored on the Stop. */
export type StopAddressComponents = {
  [K in 'addressStreetNumber' | 'addressStreet' | 'addressSuburb' | 'addressPostcode']?: StopLocationFields[K] | null;
};

/**
 * The Property key for a Stop at `address`, from the geocoded address
 * components stored with it -- or the entered address alone, so a Stop whose
 * geocode failed, or that was imported without one, still has a Property.
 */
export function stopPropertyKey(address: string, fields: StopAddressComponents): string | undefined {
  return propertyKey(address, {
    streetNumber: fields.addressStreetNumber ?? undefined,
    street: fields.addressStreet ?? undefined,
    suburb: fields.addressSuburb ?? undefined,
    postcode: fields.addressPostcode ?? undefined,
  });
}

/** A propertyKey prefix for a suburb or street search -- delimited, so it matches that suburb or street exactly. */
export function propertyKeyPrefix(
  search: { suburb: string } | { suburb: string; postcode: string; street?: string }
): string {
  const parts = [normalise(search.suburb)];
  if ('postcode' in search) parts.push(search.postcode);
  if ('postcode' in search && search.street !== undefined) parts.push(normaliseStreet(search.street));
  return `${parts.join('|')}|`;
}

/** A Property key's parts. `postcode` is empty when neither the address nor the geocode gave one. */
export interface PropertyKeyParts {
  suburb: string;
  postcode: string;
  street: string;
  number: string;
}

const DELIMITER = '|';

/** A Property key's parts, or null if `key` isn't one (e.g. an address search from a request). */
export function parsePropertyKey(key: string): PropertyKeyParts | null {
  const parts = key.split(DELIMITER);
  if (parts.length !== 4) return null;
  const [suburb, postcode, street, number] = parts;
  if (!suburb || !street || !number) return null;
  return { suburb, postcode, street, number };
}

/** The key's suburb|postcode|street -- Properties on one street share it, and same-named streets in two suburbs don't. */
export function streetKeyOf(key: string): string {
  return key.split(DELIMITER).slice(0, 3).join(DELIMITER);
}

/** Property keys in suburb, street, then street-number order (2 before 14). */
export function comparePropertyKeys(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

/** "Epping 2121", or "Epping" with no postcode. */
export function suburbLabel(suburb: string, postcode: string): string {
  return [titleCase(suburb), postcode].filter(Boolean).join(' ');
}

/** "Cliff Road, Epping 2121". */
export function streetLabel({ suburb, postcode, street }: Omit<PropertyKeyParts, 'number'>): string {
  return `${titleCase(street)}, ${suburbLabel(suburb, postcode)}`;
}

/** "14 Cliff Road, Epping 2121" -- for a Property with no entered address to show. A malformed key is shown as is. */
export function propertyKeyLabel(key: string): string {
  const parts = parsePropertyKey(key);
  return parts ? `${parts.number} ${streetLabel(parts)}` : key;
}
