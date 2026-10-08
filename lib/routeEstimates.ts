/**
 * Route Estimates as administrators use them (#515, ADR 0011): the stored
 * estimate for a Route, and asking the server to calculate a new one. The
 * calculation is server-side because it needs the Routes API key and writes
 * the staff-only record.
 */
import type { Schema } from '@/amplify/data/resource';
import { callApi } from '@/lib/apiClient';
import { getDataClient } from '@/lib/data-client';

export type StoredRouteEstimate = Schema['RouteEstimate']['type'];

export type RouteEstimateResult =
  | { ok: true; estimate: StoredRouteEstimate }
  | { ok: false; error: string };

/** The Route's stored estimate, or null if it has none. Reads the record; makes no Maps call. */
export async function getRouteEstimate(routeId: string): Promise<{ data: StoredRouteEstimate | null; error?: string }> {
  try {
    const { data, errors } = await getDataClient().models.RouteEstimate.get({ id: routeId });
    if (errors?.length) return { data: null, error: 'Could not load the Route Estimate.' };
    return { data: data ?? null };
  } catch {
    return { data: null, error: 'Could not load the Route Estimate.' };
  }
}

/** Asks the server to calculate and store a new estimate; the previous one stays if it fails. */
export async function calculateRouteEstimate(routeId: string): Promise<RouteEstimateResult> {
  try {
    const { estimate } = await callApi<{ estimate: StoredRouteEstimate }>('/api/route-estimates/calculate', { routeId });
    return { ok: true, estimate };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not calculate the estimate.' };
  }
}

export function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`;
}
