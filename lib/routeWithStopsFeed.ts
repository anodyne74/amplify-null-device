'use client';

import { getDataClient } from '@/lib/data-client';
import type { Route, Stop } from '@/amplify/types';

export interface RouteWithStopsFeedHandlers {
  /** The Route as it now stands. Not called while the Route is absent or
   * invisible to the caller — a live miss never blanks a fetched Route. */
  onRoute: (route: Route) => void;
  /** Every Stop on the Route as it now stands. */
  onStops: (stops: Stop[]) => void;
  onError: (err: unknown) => void;
}

/**
 * Live AppSync feed for one Route and its Stops, via two observeQuery
 * subscriptions. Only synced snapshots are delivered — observeQuery's
 * pre-sync emissions can be partial, and a partial Stop list would read as
 * Stops disappearing. viewerSubs authorization (amplify/data/resource.ts)
 * scopes what a customer's subscription can receive, so no access check
 * is needed here.
 *
 * Returns an unsubscribe function.
 */
export function subscribeRouteWithStops(routeId: string, handlers: RouteWithStopsFeedHandlers): () => void {
  const models = getDataClient().models;

  const routeSubscription = models.Route.observeQuery({ filter: { id: { eq: routeId } } }).subscribe({
    next: ({ items, isSynced }) => {
      const route = items[0] as unknown as Route | undefined;
      if (isSynced && route) handlers.onRoute(route);
    },
    error: handlers.onError,
  });

  const stopsSubscription = models.Stop.observeQuery({ filter: { routeId: { eq: routeId } } }).subscribe({
    next: ({ items, isSynced }) => {
      if (isSynced) handlers.onStops(items as unknown as Stop[]);
    },
    error: handlers.onError,
  });

  return () => {
    routeSubscription.unsubscribe();
    stopsSubscription.unsubscribe();
  };
}
