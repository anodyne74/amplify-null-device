/**
 * Creating a Route on New route (CONTEXT.md): the Route, then its Stops, then
 * its Route Request. Each step happens only if the one before it fully
 * worked; a failure after the Route exists says so, because the Route is kept
 * and the administrator finishes it from its detail page.
 */
import { DataError } from '@/lib/graphqlResult';
import { createRoute, createStopsForRoute, type CreateStopsForRouteInput } from '@/lib/routes';
import { attachNewRouteRequest } from '@/lib/routeRequests';

export type CreateRouteWithStopsResult = { ok: true; routeId: string } | { ok: false; error: string };

export async function createRouteWithStops(input: {
  route: { routeCode: string; customerId: string; scheduledDate: string; pickupDate: string; notes?: string };
  stops: CreateStopsForRouteInput[];
  request: Omit<Parameters<typeof attachNewRouteRequest>[0], 'routeId' | 'customerId'>;
}): Promise<CreateRouteWithStopsResult> {
  const { route, stops, request } = input;
  try {
    const created = await createRoute({
      routeCode: route.routeCode.trim(),
      customerId: route.customerId,
      scheduledDate: route.scheduledDate,
      pickupDate: route.pickupDate,
      status: 'planned',
      notes: route.notes || undefined,
    });

    const failedStops = (await createStopsForRoute(created.id, route.customerId, stops))
      .filter((result) => !result.success)
      .map((result) => `#${result.index + 1} (${result.address || 'Unknown address'}): ${result.errorMessage}`);
    if (failedStops.length > 0) {
      return { ok: false, error: `Route was created, but ${failedStops.length} stop(s) failed to save: ${failedStops.join(' | ')}` };
    }

    const attached = await attachNewRouteRequest({ ...request, routeId: created.id, customerId: route.customerId });
    if (!attached.ok) {
      return {
        ok: false,
        error: `Route was created, but not linked to its Route Request: ${attached.error} Link it from the Route's Requests.`,
      };
    }

    return { ok: true, routeId: created.id };
  } catch (err) {
    if (!(err instanceof DataError)) console.error('Creating the Route failed:', err);
    return { ok: false, error: err instanceof DataError ? err.message : 'An unexpected error occurred.' };
  }
}
