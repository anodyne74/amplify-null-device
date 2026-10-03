/**
 * Pickup Date (CONTEXT.md): the day a Route's signs are planned to come down,
 * usually the day after its Placement Date. Dates are YYYY-MM-DD.
 */

/** The Pickup Date a new Route starts with: the day after its Placement Date. */
export function defaultPickupDate(placementDate: string): string {
  const next = new Date(`${placementDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
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
