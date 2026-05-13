'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthenticator } from '@aws-amplify/ui-react';
import OperatorRoute from '@/app/components/OperatorRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { isAdmin } from '@/lib/amplify-config';
import { deleteRoute } from '@/lib/queries';
import { listAllRoutes } from '@/lib/queries/ListAllRoutes';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';
import type { Route, RouteStatus } from '@/amplify/types';
import styles from './page.module.css';

type StatusFilter = RouteStatus | 'all';

function StatusBadge({ status }: { status?: string | null }) {
  const badgeClass = {
    planned: styles.badgePlanned,
    signs_placed: styles.badgeActive,
    signs_picked_up: styles.badgeActive,
    completed: styles.badgeCompleted,
    archived: styles.badgeArchived,
  }[(status ?? 'planned') as string] ?? styles.badgePlanned;

  const label = {
    planned: 'planned',
    signs_placed: 'signs placed',
    signs_picked_up: 'signs picked up',
    completed: 'completed',
    archived: 'archived',
  }[(status ?? 'planned') as string] ?? (status || 'unknown');

  return (
    <span className={`${styles.badge} ${badgeClass}`}>{label}</span>
  );
}

function formatDate(dateString?: string) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDuration(route: Route) {
  if (typeof route.actualDurationMinutes === 'number') {
    return `${route.actualDurationMinutes} min`;
  }

  if ((route.status === 'signs_placed' || route.status === 'signs_picked_up') && route.actualStartTime) {
    const minutes = Math.max(
      1,
      Math.round((Date.now() - new Date(route.actualStartTime).getTime()) / 60000)
    );
    return `${minutes} min (in progress)`;
  }

  return '—';
}

export default function OperatorRoutesPage() {
  const { user } = useAuthenticator();
  const canDeleteRoutes = isAdmin(user);

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
        setRoutes(routesResult.data as unknown as Route[]);
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
    fetchRoutes();
  }, []);

  const filtered =
    statusFilter === 'all' ? routes : routes.filter((r) => r.status === statusFilter);

  const handleDeleteRoute = async (route: Route) => {
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

    setRoutes((prev) => prev.filter((r) => r.id !== route.id));
    setDeletingRouteId(null);
  };

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.pageHeader}>
          <h1 className={styles.heading}>Routes</h1>
          <Link href="/administrator/routes/new">
            <button className={styles.btnCreateRoute}>
              Create New Route
            </button>
          </Link>
        </div>

        {loading && <LoadingSpinner message="Loading routes..." />}

        {!loading && error && (
          <div className={styles.errorBanner}>
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Status Filter */}
            <div className={styles.filterRow}>
              <label className={styles.filterLabel}>
                Status:
              </label>
              {(['all', 'planned', 'signs_placed', 'signs_picked_up', 'completed', 'archived'] as StatusFilter[]).map(
                (s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`${styles.filterBtn} ${statusFilter === s ? styles.filterBtnActive : ''}`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')}
                  </button>
                )
              )}
            </div>

            {filtered.length === 0 ? (
              <div className={styles.emptyState}>
                <p className={styles.emptyStateText}>No routes found.</p>
              </div>
            ) : (
              <div className={styles.routesList}>
                {filtered.map((route) => (
                  <div key={route.id} className={styles.routeRow}>
                    <div>
                      <div className={styles.cellLabel}>Route ID</div>
                      <div className={styles.cellValueMono}>{route.routeCode || route.id.slice(0, 8)}</div>
                    </div>
                    <div>
                      <div className={styles.cellLabel}>Customer</div>
                      <div className={styles.cellValueMonoNormal}>{customersById[route.customerId] || 'Unknown customer'}</div>
                    </div>
                    <div>
                      <StatusBadge status={route.status} />
                    </div>
                    <div>
                      <div className={styles.cellLabel}>Created</div>
                      <div className={styles.cellValue}>{formatDate(route.createdAt)}</div>
                    </div>
                    <div>
                      <div className={styles.cellLabel}>Duration</div>
                      <div className={styles.cellValue}>{formatDuration(route)}</div>
                      {route.notes && (
                        <div className={styles.notesPreview}>
                          {route.notes.slice(0, 60)}
                          {route.notes.length > 60 ? '…' : ''}
                        </div>
                      )}
                    </div>
                    <div className={styles.cellRight}>
                      <Link
                        href={`/administrator/routes/detail?id=${route.id}`}
                        className={styles.viewLink}
                      >
                        View
                      </Link>
                      <Link
                        href={`/administrator/routes/edit?id=${route.id}`}
                        className={styles.editLink}
                      >
                        Edit
                      </Link>
                      {canDeleteRoutes && (
                        <button
                          type="button"
                          className={styles.deleteBtn}
                          onClick={() => {
                            void handleDeleteRoute(route);
                          }}
                          disabled={deletingRouteId === route.id}
                        >
                          {deletingRouteId === route.id ? 'Deleting...' : 'Delete'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </OperatorRoute>
  );
}
