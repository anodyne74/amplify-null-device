'use client';

import { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { listMyRoutes } from '@/lib/queries/ListMyRoutes';
import { getCustomerPortalContext } from '@/lib/queries';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import RouteListItem from '@/app/customer/components/RouteListItem';
import type { Route } from '@/amplify/types';
import { compareRouteIdDesc, compareRouteStatusAsc } from '@/lib/routeListHelpers';
import { ROUTE_STATUS_FILTERS, type StatusFilter } from '@/lib/useRoutesList';
import styles from './page.module.css';

function formatStatusFilterLabel(status: StatusFilter) {
  if (status === 'all') return 'All Statuses';
  return status
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

/**
 * Customer Routes List Page
 * Displays all routes for the current customer with filtering and sorting
 */
export default function CustomerRoutesPage() {
  const { user } = useAuthenticator();
  const userId = user?.userId;
  
  const [routes, setRoutes] = useState<Route[]>([]);
  const [filteredRoutes, setFilteredRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<'routeId' | 'status'>('routeId');

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function fetchRoutes() {
      setLoading(true);
      setError(null);

      try {
        const context = await getCustomerPortalContext(userId);

        if (!context.customerId) {
          if (!cancelled) {
            setError('Could not resolve your customer account');
            setRoutes([]);
          }
          return;
        }

        const result = await listMyRoutes({ customerId: context.customerId, limit: 50 });

        if (cancelled) return;

        if (result.errors) {
          setError('Failed to load routes');
        } else if (result.data) {
          setRoutes(result.data as unknown as Route[]);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load routes');
          setRoutes([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchRoutes();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Apply filtering and sorting
  useEffect(() => {
    let filtered = [...routes];

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((route) => route.status === statusFilter);
    }

    // Apply sorting
    if (sortBy === 'routeId') {
      filtered.sort(compareRouteIdDesc);
    } else {
      filtered.sort(compareRouteStatusAsc);
    }

    setFilteredRoutes(filtered);
  }, [routes, statusFilter, sortBy]);

  if (loading) {
    return <LoadingSpinner message="Loading routes..." />;
  }

  return (
    <ProtectedRoute>
      <div>
        <h1>Your Routes</h1>

        {error && (
          <div className={styles.errorBanner}>
            {error}
          </div>
        )}

        {/* Filters */}
        <div className={styles.filtersRow}>
          <div>
            <label className={styles.filterLabel}>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className={styles.select}
            >
              {ROUTE_STATUS_FILTERS.map((status) => (
                <option key={status} value={status}>
                  {formatStatusFilterLabel(status)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={styles.filterLabel}>Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'routeId' | 'status')}
              className={styles.select}
            >
              <option value="routeId">Route ID (Desc)</option>
              <option value="status">Status</option>
            </select>
          </div>
        </div>

        {/* Routes List */}
        {filteredRoutes.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No routes found</p>
          </div>
        ) : (
          <div className={styles.routesList}>
            {filteredRoutes.map((route) => (
              <RouteListItem key={route.id} route={route} />
            ))}
          </div>
        )}

        <div className={styles.summary}>
          <p className={styles.summaryText}>Showing {filteredRoutes.length} routes</p>
          <p className={styles.summarySubtext}>
            Click on any route to view details and stops
          </p>
        </div>
      </div>
    </ProtectedRoute>
  );
}
