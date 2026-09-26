'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Route, Stop } from '@/amplify/types';
import {
  buildPropertyMatches,
  countDistinctProperties,
  PROPERTY_MATCH_SCOPES,
  type PropertyMatch,
  type PropertyMatchScope,
} from '@/lib/propertySearchHelpers';
import { listAllStops } from '@/lib/routes';

/** Backs the administrator Routes "Find a property" card — searches every
 *  stop's address across all routes, independent of the routes hook's own
 *  status/search/date filters. */
export function usePropertySearch(routes: Route[], customersById: Record<string, string>) {
  const [stops, setStops] = useState<Stop[]>([]);
  const [stopsLoading, setStopsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<PropertyMatchScope>('Anything');
  const [focusedRouteId, setFocusedRouteId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAllStops() {
      setStopsLoading(true);
      const result = await listAllStops();
      setStops(result.data as Stop[]);
      setStopsLoading(false);
    }

    void fetchAllStops();
  }, []);

  const routesById = useMemo(() => {
    const map: Record<string, Route> = {};
    routes.forEach((route) => {
      map[route.id] = route;
    });
    return map;
  }, [routes]);

  const matches: PropertyMatch[] = useMemo(
    () => buildPropertyMatches(stops, routesById, customersById, query, scope),
    [stops, routesById, customersById, query, scope]
  );

  const matchedRouteIds = useMemo(() => {
    const ids = new Set<string>();
    matches.forEach((match) => match.routes.forEach((r) => ids.add(r.routeId)));
    return Array.from(ids);
  }, [matches]);

  const totalPropertiesCount = useMemo(() => countDistinctProperties(stops), [stops]);

  const filterActive = matches.length > 0 || !!focusedRouteId;
  const shownRouteIds = focusedRouteId ? [focusedRouteId] : matchedRouteIds;

  function toggleFocusRoute(routeId: string) {
    setFocusedRouteId((current) => (current === routeId ? null : routeId));
  }

  function clear() {
    setQuery('');
    setFocusedRouteId(null);
  }

  /** Typing a new query drops any focused route, matching the design's onPropQuery handler. */
  function handleQueryChange(value: string) {
    setQuery(value);
    setFocusedRouteId(null);
  }

  return {
    query,
    setQuery: handleQueryChange,
    scope,
    setScope,
    scopes: PROPERTY_MATCH_SCOPES,
    stopsLoading,
    matches,
    matchedRouteIds,
    totalPropertiesCount,
    totalRoutesCount: routes.length,
    focusedRouteId,
    toggleFocusRoute,
    filterActive,
    shownRouteIds,
    clear,
  };
}

export type UsePropertySearchResult = ReturnType<typeof usePropertySearch>;
