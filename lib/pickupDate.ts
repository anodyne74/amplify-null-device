import type { StandingPickupDay } from '@/amplify/types';

/**
 * Pickup Date (CONTEXT.md): the day a Route's signs are planned to come down,
 * usually the day after its Placement Date. Dates are YYYY-MM-DD.
 */

const WEEKDAYS: StandingPickupDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** The Pickup Date a new Route starts with: the first day on the Customer's
 *  Standing Pickup Day strictly after its Placement Date, or the day after
 *  the Placement Date when the Customer has none. */
export function defaultPickupDate(placementDate: string, standingPickupDay?: StandingPickupDay | null): string {
  const next = new Date(`${placementDate}T00:00:00Z`);
  // The field is a plain string in the schema, so anything else counts as no day.
  const weekday = standingPickupDay ? WEEKDAYS.indexOf(standingPickupDay) : -1;
  // 1 to 7 days ahead: never the Placement Date itself, so the same weekday is a week later.
  const days = weekday === -1 ? 1 : ((weekday - next.getUTCDay() + 6) % 7) + 1;
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/** Why a Pickup Date can't be saved for this Placement Date, or null if it can.
 *  The same day is allowed. */
export function pickupDateProblem(placementDate: string, pickupDate: string): string | null {
  if (!pickupDate) return 'Choose a pickup date.';
  if (pickupDate < placementDate) return 'The pickup date must be on or after the placement date.';
  return null;
}

/** The pickup date a Customer is shown: the Pickup Date, else when Pickup
 *  started (Routes from before Pickup Dates existed), else null while unknown. */
export function customerPickupDate(route: {
  pickupDate?: string | null;
  pickupStartTime?: string | null;
}): string | null {
  return route.pickupDate || route.pickupStartTime || null;
}
