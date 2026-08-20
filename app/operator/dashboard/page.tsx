'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { getUserDisplayName } from '@/lib/amplify-config';
import { listAllRoutes } from '@/lib/queries/ListAllRoutes';
import type { Route } from '@/amplify/types';
import PageHeader from '@/app/operator/components/PageHeader';
import { RouteStatusPill } from '@/app/operator/components/RouteStatusPill';
import { Card } from '@/app/components/ui/core/Card';
import { StatTile } from '@/app/components/ui/data/StatTile';
import styles from './page.module.css';

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
    () =>
      routes.filter(
        (route) =>
          route.status === 'in_progress' || route.status === 'signs_placed' || route.status === 'signs_picked_up'
      ),
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
      <PageHeader
        title="Operator Portal"
        subtitle={`Welcome,${userDisplayName ? ` ${userDisplayName}.` : ''} Review active work and pick up the next route.`}
      />

      <div className={styles.statsGrid}>
        <StatTile label="Active routes" value={loading ? '…' : activeRoutes.length} icon="route" />
        <StatTile label="Planned routes" value={loading ? '…' : plannedRoutes.length} icon="clipboard-list" />
        <StatTile label="Execution queue" value={loading ? '…' : priorityRoutes.length} icon="timer" />
      </div>

      <Card title="Route Execution" subtitle="Optimized for phone usage. Tap a route to continue stop progression.">
        {loading ? (
          <p className={styles.mutedText}>Loading routes...</p>
        ) : priorityRoutes.length === 0 ? (
          <p className={styles.mutedText}>No planned or active routes available.</p>
        ) : (
          <div className={styles.trackerList}>
            {priorityRoutes.map((route) => (
              <Link key={route.id} href={`/operator/routes/detail?id=${route.id}`} className={styles.trackerCard}>
                <div className={styles.trackerTopRow}>
                  <strong>{route.routeCode || route.id.slice(0, 8)}</strong>
                  <RouteStatusPill status={route.status} />
                </div>
                <div className={styles.trackerMeta}>Created: {formatDate(route.createdAt)}</div>
                <div className={styles.trackerAction}>Open Route</div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
