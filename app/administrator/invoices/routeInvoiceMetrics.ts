import type { Route } from '@/amplify/types';

/**
 * Billed minutes for a route, override-first — same precedence as
 * useInvoiceDerivedFormEffects's private getRouteDurationHours, exported here so
 * InvoicePreview can show it alongside distance/cost/driver split.
 */
export function getFinalizedRouteMinutes(route?: Route | null): number {
  if (!route) return 0;
  return route.overrideDurationMinutes ?? route.actualDurationMinutes ?? 0;
}

/**
 * Distance for a route, override-first. overrideDistanceKm is the figure an
 * operator confirms on the Finalise screen; signsPlacedDistanceKm +
 * signsPickedUpDistanceKm is the measured fallback for routes finalised before
 * that override existed.
 */
export function getFinalizedRouteDistanceKm(route?: Route | null): number {
  if (!route) return 0;
  if (typeof route.overrideDistanceKm === 'number') return route.overrideDistanceKm;
  return (route.signsPlacedDistanceKm ?? 0) + (route.signsPickedUpDistanceKm ?? 0);
}
