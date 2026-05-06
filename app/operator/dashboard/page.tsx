'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { getUserDisplayName } from '@/lib/amplify-config';
import { listAllRoutes } from '@/lib/queries/ListAllRoutes';
import type { Route } from '@/amplify/types';
import styles from '@/app/dashboard.module.css';

function formatDate(dateString?: string | null) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Operator Dashboard
 * Phone-optimized route execution entry point for planned + active routes.
 */
export default function OperatorDashboard() {
  const { user } = useAuthenticator();
  const userDisplayName = user ? getUserDisplayName(user) : '';
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRoutes() {
      setLoading(true);
      const result = await listAllRoutes({ limit: 100 });
      if (!result.errors || result.errors.length === 0) {
        setRoutes((result.data as Route[]) || []);
      }
      setLoading(false);
    }
    void loadRoutes();
  }, []);

  const activeRoutes = useMemo(
    () => routes.filter((route) => route.status === 'active'),
    [routes]
  );
  const plannedRoutes = useMemo(
    () => routes.filter((route) => route.status === 'planned'),
    [routes]
  );
  const priorityRoutes = useMemo(
    () => [...activeRoutes, ...plannedRoutes].slice(0, 8),
    [activeRoutes, plannedRoutes]
  );

  return (
    <div className={styles.page}>
      <div>
        <h1 className={styles.heading}>Operator Dashboard</h1>
        <p className={styles.welcome}>Welcome, {userDisplayName}</p>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Active Routes</p>
          <p className={`${styles.statValue} ${styles.green}`}>{activeRoutes.length}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Planned Routes</p>
          <p className={`${styles.statValue} ${styles.cyan}`}>{plannedRoutes.length}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Execution Queue</p>
          <p className={`${styles.statValue} ${styles.amber}`}>{priorityRoutes.length}</p>
        </div>
      </div>

      <div className={styles.infoPanel}>
        <h3>Route Execution</h3>
        <p className={styles.welcome}>Optimized for phone usage. Tap a route to continue stop progression.</p>

        {loading ? (
          <p className={styles.welcome}>Loading routes...</p>
        ) : priorityRoutes.length === 0 ? (
          <p className={styles.welcome}>No planned or active routes available.</p>
        ) : (
          <div className={styles.mobileRouteList}>
            {priorityRoutes.map((route) => (
              <Link
                key={route.id}
                href={`/operator/routes/detail?id=${route.id}`}
                className={styles.mobileRouteCard}
              >
                <div className={styles.mobileRouteTopRow}>
                  <strong>{route.routeCode || route.id.slice(0, 8)}</strong>
                  <span className={route.status === 'active' ? styles.routeStatusActive : styles.routeStatusPlanned}>
                    {route.status || 'planned'}
                  </span>
                </div>
                <div className={styles.mobileRouteMeta}>Created: {formatDate(route.createdAt)}</div>
                <div className={styles.mobileRouteAction}>Open Route</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
