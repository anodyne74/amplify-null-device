/**
 * The Location review queue (#286): the Properties an administrator should look
 * at -- an Approximate pin (CONTEXT.md "Location Precision"), a Stop with no pin
 * at all (#344: its geocode failed, or it was imported), or a geocoder suburb
 * the entered address doesn't mention (the entered address wins,
 * CONTEXT.md "Property", so a mismatch is worth a human look). A Confirmed
 * Property never appears; a dismissed suburb mismatch stays dismissed.
 */

import { comparePropertyKeys } from '@/lib/propertyKey';

export interface Pin {
  latitude: number;
  longitude: number;
}

export interface SuggestedPin extends Pin {
  accuracyMeters: number | null;
  recordedAt: string;
}

/** The Stop fields the queue reads. */
export interface ReviewStop {
  id: string;
  routeId?: string | null;
  customerId?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationPrecision?: string | null;
  addressSuburb?: string | null;
  propertyKey?: string | null;
  placedLatitude?: number | null;
  placedLongitude?: number | null;
  placedAccuracyMeters?: number | null;
  placedPositionAt?: string | null;
}

/** An administrator's decisions for one Property (the PropertyLocation model). */
export interface PropertyDecision {
  propertyKey: string;
  latitude?: number | null;
  longitude?: number | null;
  confirmedAt?: string | null;
  suburbMismatchDismissedAt?: string | null;
}

export interface PropertyReview {
  propertyKey: string;
  stops: ReviewStop[];
  approximate: boolean;
  /** Some Stop at the Property has no pin, so it isn't on the map (#344). */
  noPin: boolean;
  /**
   * Some Stop here says Confirmed, but this Property isn't: its pin was
   * Confirmed for another address, before the Stop's address was edited.
   */
  confirmedElsewhere: boolean;
  suburbMismatch: { geocodedSuburb: string } | null;
  currentPin: Pin | null;
  /** The latest operator placement GPS fix at the Property (#285), if any. */
  suggestedPin: SuggestedPin | null;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The same rule as the backfill assess mode's suburb mismatch (scripts/backfill-geocodes.js). */
export function hasSuburbMismatch(stop: ReviewStop): boolean {
  const suburb = stop.addressSuburb;
  return Boolean(suburb && !new RegExp(`\\b${escapeRegExp(suburb)}\\b`, 'i').test(stop.address ?? ''));
}

function hasPin(stop: ReviewStop): boolean {
  return typeof stop.latitude === 'number' && typeof stop.longitude === 'number';
}

function currentPin(stops: ReviewStop[]): Pin | null {
  const located = stops.find(hasPin);
  return located ? { latitude: located.latitude as number, longitude: located.longitude as number } : null;
}

function suggestedPin(stops: ReviewStop[]): SuggestedPin | null {
  const placed = stops
    .filter((stop) => typeof stop.placedLatitude === 'number' && typeof stop.placedLongitude === 'number' && stop.placedPositionAt)
    .sort((a, b) => (b.placedPositionAt as string).localeCompare(a.placedPositionAt as string))[0];
  if (!placed) return null;
  return {
    latitude: placed.placedLatitude as number,
    longitude: placed.placedLongitude as number,
    accuracyMeters: placed.placedAccuracyMeters ?? null,
    recordedAt: placed.placedPositionAt as string,
  };
}

/** The Properties to review, ordered by their key (suburb, then street, then number). */
export function buildLocationReviewQueue(stops: ReviewStop[], decisions: PropertyDecision[]): PropertyReview[] {
  const decisionByKey = new Map(decisions.map((decision) => [decision.propertyKey, decision]));
  const stopsByKey = new Map<string, ReviewStop[]>();
  for (const stop of stops) {
    if (!stop.propertyKey) continue;
    stopsByKey.set(stop.propertyKey, [...(stopsByKey.get(stop.propertyKey) ?? []), stop]);
  }

  const queue: PropertyReview[] = [];
  for (const [propertyKey, propertyStops] of stopsByKey) {
    const decision = decisionByKey.get(propertyKey);
    if (decision?.confirmedAt) continue;

    const approximate = propertyStops.some((stop) => stop.locationPrecision === 'approximate');
    const noPin = !propertyStops.every(hasPin);
    // Past the confirmedAt check above, so a Confirmed Stop here was Confirmed at another Property.
    const confirmedElsewhere = propertyStops.some((stop) => stop.locationPrecision === 'confirmed');
    const mismatched = decision?.suburbMismatchDismissedAt ? undefined : propertyStops.find(hasSuburbMismatch);
    if (!approximate && !noPin && !confirmedElsewhere && !mismatched) continue;

    queue.push({
      propertyKey,
      stops: propertyStops,
      approximate,
      noPin,
      confirmedElsewhere,
      suburbMismatch: mismatched ? { geocodedSuburb: mismatched.addressSuburb as string } : null,
      currentPin: currentPin(propertyStops),
      suggestedPin: suggestedPin(propertyStops),
    });
  }
  return queue.sort((a, b) => comparePropertyKeys(a.propertyKey, b.propertyKey));
}
