'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Route, RouteStatus } from '@/amplify/types';
import { compareRouteIdDesc } from '@/lib/routeListHelpers';
import { deleteRoute } from '@/lib/queries';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';
import { listAllRoutes } from '@/lib/queries/ListAllRoutes';

export type StatusFilter = RouteStatus | 'all';

export const ROUTE_STATUS_FILTERS: StatusFilter[] = [
  'all',
  'planned',
  'in_progress',
  'signs_placed',
  'signs_picked_up',
  'completed',
  'archived',
];

export function useRoutesList(canDeleteRoutes: boolean) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [customersById, setCustomersById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [deletingRouteId, setDeletingRouteId] = useState<string | null>(null);

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
    () => (statusFilter === 'all' ? routes : routes.filter((route) => route.status === statusFilter)),
    [routes, statusFilter]
  );

  async function handleDeleteRoute(route: Route) {
    if (!canDeleteRoutes || deletingRouteId) return;

    const routeLabel = route.routeCode || route.id.slice(0, 8);
    const confirmed = window.confirm(
      `Delete route ${routeLabel}? This will also delete all stops on the route.`
    );
    if (!confirmed) return;

    setDeletingRouteId(route.id);
    setError(null);

    const result = await deleteRoute(route.id);
    if (result.errors && result.errors.length > 0) {
      setError('Failed to delete route.');
      setDeletingRouteId(null);
      return;
    }

    setRoutes((prev) => prev.filter((currentRoute) => currentRoute.id !== route.id));
    setDeletingRouteId(null);
  }

  return {
    customersById,
    deletingRouteId,
    error,
    filteredRoutes,
    handleDeleteRoute,
    loading,
    statusFilter,
    setStatusFilter,
  };
}
