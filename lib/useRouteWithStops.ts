'use client';

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { getRouteWithStops } from '@/lib/queries';
import { subscribeRouteWithStops } from '@/lib/routeWithStopsFeed';
import type { Route, Stop } from '@/amplify/types';

const LOAD_ERROR = 'Failed to load route.';

interface Patch<T> {
  /** updatedAt of the record the patch was laid over. */
  baseline: string | null | undefined;
  patch: Partial<T>;
}

export interface RouteWithStopsState {
  route: Route | null;
  stops: Stop[];
  routePatch: Patch<Route> | null;
  stopPatches: Record<string, Patch<Stop>>;
  loading: boolean;
  error: string | null;
}

export type RouteWithStopsAction =
  | { type: 'reset'; loading: boolean }
  | { type: 'fetched'; route: Route | null; stops: Stop[] }
  | { type: 'fetchFailed'; error: string }
  | { type: 'liveRoute'; route: Route }
  | { type: 'liveStops'; stops: Stop[] }
  | { type: 'patchRoute'; patch: Partial<Route> }
  | { type: 'patchStop'; id: string; patch: Partial<Stop> };

export const EMPTY_ROUTE_WITH_STOPS: RouteWithStopsState = {
  route: null,
  stops: [],
  routePatch: null,
  stopPatches: {},
  loading: false,
  error: null,
};

type Versioned = { id: string; updatedAt?: string | null };

/** The fetch and the live feed race — whichever lands last wins, unless it
 * carries an older version of the same record than the one already held. */
function freshest<T extends Versioned>(current: T | null | undefined, incoming: T): T {
  if (current && current.id === incoming.id && (current.updatedAt ?? '') > (incoming.updatedAt ?? '')) {
    return current;
  }
  return incoming;
}

function mergeStops(current: Stop[], incoming: Stop[]): Stop[] {
  const byId = new Map(current.map((stop) => [stop.id, stop]));
  return incoming.map((stop) => freshest(byId.get(stop.id), stop));
}

/**
 * Keeps a stop patch only while its stop is still at the version the patch
 * was laid over. Comparing versions rather than timestamps against the local
 * clock means device clock skew can't hold a patch too long or drop it early.
 */
function keepStopPatches(stops: Stop[], patches: Record<string, Patch<Stop>>): Record<string, Patch<Stop>> {
  const byId = new Map(stops.map((stop) => [stop.id, stop]));
  const kept: Record<string, Patch<Stop>> = {};
  for (const [id, entry] of Object.entries(patches)) {
    const stop = byId.get(id);
    if (stop && stop.updatedAt === entry.baseline) kept[id] = entry;
  }
  return kept;
}

export function routeWithStopsReducer(state: RouteWithStopsState, action: RouteWithStopsAction): RouteWithStopsState {
  switch (action.type) {
    case 'reset':
      return { ...EMPTY_ROUTE_WITH_STOPS, loading: action.loading };

    case 'fetched':
      // A fetch is an explicit resync, so it also settles every pending patch.
      return {
        route: action.route ? freshest(state.route, action.route) : null,
        stops: mergeStops(state.stops, action.stops),
        routePatch: null,
        stopPatches: {},
        loading: false,
        error: null,
      };

    case 'fetchFailed':
      return { ...state, loading: false, error: action.error };

    case 'liveRoute': {
      const route = freshest(state.route, action.route);
      const routePatch = state.routePatch && route.updatedAt === state.routePatch.baseline ? state.routePatch : null;
      return { ...state, route, routePatch };
    }

    case 'liveStops': {
      const stops = mergeStops(state.stops, action.stops);
      return { ...state, stops, stopPatches: keepStopPatches(stops, state.stopPatches) };
    }

    case 'patchRoute':
      if (!state.route) return state;
      return {
        ...state,
        routePatch: { baseline: state.route.updatedAt, patch: { ...state.routePatch?.patch, ...action.patch } },
      };

    case 'patchStop': {
      const stop = state.stops.find((s) => s.id === action.id);
      if (!stop) return state;
      return {
        ...state,
        stopPatches: {
          ...state.stopPatches,
          [action.id]: { baseline: stop.updatedAt, patch: { ...state.stopPatches[action.id]?.patch, ...action.patch } },
        },
      };
    }
  }
}

/** What the screen shows: the held records with pending patches laid over,
 * Stops in sequence order. */
export function routeWithStopsView(state: RouteWithStopsState): { route: Route | null; stops: Stop[] } {
  const route = state.route && state.routePatch ? { ...state.route, ...state.routePatch.patch } : state.route;
  const stops = state.stops
    .map((stop) => (state.stopPatches[stop.id] ? { ...stop, ...state.stopPatches[stop.id].patch } : stop))
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  return { route, stops };
}

async function fetchRouteWithStops(routeId: string): Promise<RouteWithStopsAction> {
  const { route, stops, errors } = await getRouteWithStops(routeId);
  if (errors && errors.length > 0) {
    return { type: 'fetchFailed', error: LOAD_ERROR };
  }
  return { type: 'fetched', route: route as unknown as Route | null, stops: stops as unknown as Stop[] };
}

/**
 * One live Route and its Stops — the single source for the route detail
 * screens.
 *
 * First paint comes from a one-shot fetch; a live feed of Route and Stop
 * changes (lib/routeWithStopsFeed.ts) is layered over it, and resubscribes
 * on window focus since a dropped realtime connection can go stale without
 * surfacing an error.
 *
 * After a write, a caller can show its result straight away with
 * patchRoute/patchStop: the patch sits over the live data until a newer
 * version of that record arrives (normally the write's own echo), then
 * drops. refetch() forces a resync and settles every patch.
 *
 * `error` is set only when the first fetch fails. A Route that doesn't exist
 * or isn't visible to the caller resolves to route: null with no error.
 */
export function useRouteWithStops(routeId: string | null) {
  const [state, dispatch] = useReducer(routeWithStopsReducer, EMPTY_ROUTE_WITH_STOPS, (empty) => ({
    ...empty,
    loading: Boolean(routeId),
  }));
  const [resyncToken, setResyncToken] = useState(0);

  useEffect(() => {
    dispatch({ type: 'reset', loading: Boolean(routeId) });
    if (!routeId) return;

    let cancelled = false;
    fetchRouteWithStops(routeId).then((action) => {
      if (!cancelled) dispatch(action);
    });
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  useEffect(() => {
    if (!routeId) return;
    return subscribeRouteWithStops(routeId, {
      onRoute: (route) => dispatch({ type: 'liveRoute', route }),
      onStops: (stops) => dispatch({ type: 'liveStops', stops }),
      onError: (err) => console.error('Live route feed error:', err),
    });
  }, [routeId, resyncToken]);

  useEffect(() => {
    function handleFocus() {
      setResyncToken((token) => token + 1);
    }
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const patchRoute = useCallback((patch: Partial<Route>) => dispatch({ type: 'patchRoute', patch }), []);
  const patchStop = useCallback((id: string, patch: Partial<Stop>) => dispatch({ type: 'patchStop', id, patch }), []);

  /** A failed refetch keeps what's already shown. */
  const refetch = useCallback(async () => {
    if (!routeId) return;
    const action = await fetchRouteWithStops(routeId);
    if (action.type === 'fetched') dispatch(action);
  }, [routeId]);

  const { route, stops } = useMemo(() => routeWithStopsView(state), [state]);

  return { route, stops, loading: state.loading, error: state.error, patchRoute, patchStop, refetch };
}
