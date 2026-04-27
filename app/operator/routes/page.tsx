'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import OperatorRoute from '@/app/components/OperatorRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { listAllRoutes } from '@/lib/queries/ListAllRoutes';
import type { Route, RouteStatus } from '@/amplify/types';
import styles from './page.module.css';

type StatusFilter = RouteStatus | 'all';

function StatusBadge({ status }: { status?: string | null }) {
  const badgeClass = { planned: styles.badgePlanned, active: styles.badgeActive, completed: styles.badgeCompleted, archived: styles.badgeArchived }[(status ?? 'planned') as string] ?? styles.badgePlanned;
  return (
    <span className={`${styles.badge} ${badgeClass}`}>{status || 'unknown'}</span>
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

export default function OperatorRoutesPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    async function fetchRoutes() {
      setLoading(true);
      setError(null);
      const result = await listAllRoutes({ limit: 100 });
      if (result.errors && result.errors.length > 0) {
        setError('Failed to load routes.');
      } else {
        setRoutes(result.data as unknown as Route[]);
      }
      setLoading(false);
    }
    fetchRoutes();
  }, []);

  const filtered =
    statusFilter === 'all' ? routes : routes.filter((r) => r.status === statusFilter);

  return (
    <OperatorRoute>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.pageHeader}>
          <h1 className={styles.heading}>Routes</h1>
          <Link href="/operator/routes/new">
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
              {(['all', 'planned', 'active', 'completed', 'archived'] as StatusFilter[]).map(
                (s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`${styles.filterBtn} ${statusFilter === s ? styles.filterBtnActive : ''}`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
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
                      <div className={styles.cellValueMono}>{route.id.slice(0, 8)}</div>
                    </div>
                    <div>
                      <div className={styles.cellLabel}>Customer ID</div>
                      <div className={styles.cellValueMonoNormal}>{route.customerId.slice(0, 8)}</div>
                    </div>
                    <div>
                      <StatusBadge status={route.status} />
                    </div>
                    <div>
                      <div className={styles.cellLabel}>Created</div>
                      <div className={styles.cellValue}>{formatDate(route.createdAt)}</div>
                    </div>
                    <div>
                      <div className={styles.cellLabel}>Est. Duration</div>
                      <div className={styles.cellValue}>
                        {route.estimatedDurationMinutes
                          ? `${route.estimatedDurationMinutes} min`
                          : '—'}
                      </div>
                      {route.notes && (
                        <div className={styles.notesPreview}>
                          {route.notes.slice(0, 60)}
                          {route.notes.length > 60 ? '…' : ''}
                        </div>
                      )}
                    </div>
                    <div className={styles.cellRight}>
                      <Link
                        href={`/operator/routes/detail?id=${route.id}`}
                        className={styles.viewLink}
                      >
                        View
                      </Link>
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
