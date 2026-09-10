'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Route } from '@/amplify/types';
import { compareRouteIdDesc } from '@/lib/routeListHelpers';
import { deleteRoute } from '@/lib/queries';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';
import { listAllRoutes } from '@/lib/queries/ListAllRoutes';
import { getRoutePhaseKey, ROUTE_PHASE_KEYS, type RoutePhaseKey } from '@/lib/signRunPhase';

export type StatusFilter = RoutePhaseKey | 'all';

// archived is intentionally absent — it's a legacy, soft-deprecated status
// that now displays (and filters) identically to completed.
export const ROUTE_STATUS_FILTERS: StatusFilter[] = ['all', ...ROUTE_PHASE_KEYS];

export function useRoutesList(canDeleteRoutes: boolean) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [customersById, setCustomersById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [deletingRouteId, setDeletingRouteId] = useState<string | null>(null);
  const [routePendingDelete, setRoutePendingDelete] = useState<Route | null>(null);

  useEffect(() => {
    async function fetchRoutes() {
      setLoading(true);
      setError(null);

      const [routesResult, customersResult] = await Promise.all([
        listAllRoutes({ limit: 500 }),
        listAllCustomers({ limit: 200 }),
      ]);

      if (routesResult.errors && routesResult.errors.length > 0) {
        setError('Failed to load routes.');
      } else {
        const sortedRoutes = [...((routesResult.data as unknown as Route[]) || [])].sort(compareRouteIdDesc);
        setRoutes(sortedRoutes);
      }

      if (!customersResult.errors || customersResult.errors.length === 0) {
        const mapped = (customersResult.data as Array<{ id: string; name: string }>).reduce(
          (acc, customer) => {
            acc[customer.id] = customer.name;
            return acc;
          },
          {} as Record<string, string>
        );
        setCustomersById(mapped);
      }

      setLoading(false);
    }

    void fetchRoutes();
  }, []);

  const filteredRoutes = useMemo(
    () => (statusFilter === 'all' ? routes : routes.filter((route) => getRoutePhaseKey(route) === statusFilter)),
    [routes, statusFilter]
  );

  function requestDeleteRoute(route: Route) {
    if (!canDeleteRoutes || deletingRouteId) return;
    setRoutePendingDelete(route);
  }

  function cancelDeleteRoute() {
    if (deletingRouteId) return;
    setRoutePendingDelete(null);
  }

  async function handleDeleteRoute(route: Route) {
    if (!canDeleteRoutes || deletingRouteId) return;

    setDeletingRouteId(route.id);
    setError(null);

    const result = await deleteRoute(route.id);
    if (result.errors && result.errors.length > 0) {
      setError('Failed to delete route.');
      setDeletingRouteId(null);
      setRoutePendingDelete(null);
      return;
    }

    setRoutes((prev) => prev.filter((currentRoute) => currentRoute.id !== route.id));
    setDeletingRouteId(null);
    setRoutePendingDelete(null);
  }

  return {
    cancelDeleteRoute,
    customersById,
    deletingRouteId,
    error,
    filteredRoutes,
    handleDeleteRoute,
    loading,
    requestDeleteRoute,
    routePendingDelete,
    statusFilter,
    setStatusFilter,
  };
}
