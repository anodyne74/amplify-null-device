'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Route } from '@/amplify/types';
import { compareRouteIdDesc } from '@/lib/routeListHelpers';
import { useLiveAllRoutes } from '@/lib/useLiveRoutes';
import { getRoutePhaseKey, ROUTE_PHASE_KEYS, type RoutePhaseKey } from '@/lib/signRunPhase';
import { deleteRoute } from '@/lib/routes';
import { listAllCustomers } from '@/lib/customers';

export type StatusFilter = RoutePhaseKey | 'all';

// archived is intentionally absent — it's a legacy, soft-deprecated status
// that now displays (and filters) identically to completed.
export const ROUTE_STATUS_FILTERS: StatusFilter[] = ['all', ...ROUTE_PHASE_KEYS];

export function useRoutesList(canDeleteRoutes: boolean) {
  const { routes: liveRoutes, loading: routesLoading, error: routesError } = useLiveAllRoutes();
  const [customersById, setCustomersById] = useState<Record<string, string>>({});
  const [customersLoading, setCustomersLoading] = useState(true);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [deletingRouteId, setDeletingRouteId] = useState<string | null>(null);
  const [routePendingDelete, setRoutePendingDelete] = useState<Route | null>(null);
  // Optimistic overlay: a successfully deleted route disappears immediately
  // rather than waiting for the delete event to arrive back over the live
  // subscription.
  const [locallyDeletedIds, setLocallyDeletedIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    async function fetchCustomers() {
      setCustomersLoading(true);

      const customersResult = await listAllCustomers();
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

      setCustomersLoading(false);
    }

    void fetchCustomers();
  }, []);

  const routes = useMemo(
    () => [...liveRoutes].filter((route) => !locallyDeletedIds.has(route.id)).sort(compareRouteIdDesc),
    [liveRoutes, locallyDeletedIds]
  );

  const loading = routesLoading || customersLoading;
  const error = routesError ? 'Failed to load routes.' : deleteError;

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
    setDeleteError(null);

    const result = await deleteRoute(route.id);
    if (result.errors && result.errors.length > 0) {
      setDeleteError('Failed to delete route.');
      setDeletingRouteId(null);
      setRoutePendingDelete(null);
      return;
    }

    setLocallyDeletedIds((prev) => new Set(prev).add(route.id));
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
