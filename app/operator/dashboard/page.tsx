'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { listAllRoutes } from '@/lib/queries/ListAllRoutes';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';
import { getRouteWithStops } from '@/lib/queries';
import { getSignRunPhase } from '@/lib/signRunPhase';
import type { Route } from '@/amplify/types';
import PageHeader from '@/app/operator/components/PageHeader';
import { RouteStatusPill } from '@/app/operator/components/RouteStatusPill';
import { SignRunRouteCard } from '@/app/operator/components/SignRunRouteCard';
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

interface StopSummary {
  stopCount: number;
  signsTotal: number;
}

/**
 * Operator Dashboard ("Today" screen)
 * Phone-optimized route execution entry point for planned + active routes.
 */
export default function OperatorDashboard() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [customersById, setCustomersById] = useState<Record<string, string>>({});
  const [stopSummaryByRouteId, setStopSummaryByRouteId] = useState<Record<string, StopSummary>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRoutes() {
      setLoading(true);
      const [routesResult, customersResult] = await Promise.all([
        listAllRoutes({ limit: 100 }),
        listAllCustomers({ limit: 200 }),
      ]);

      if (!routesResult.errors || routesResult.errors.length === 0) {
        setRoutes((routesResult.data as Route[]) || []);
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

  // Stop/sign counts for the "N stops · N signs" line and the header summary.
  // Bounded to the (at most 8) routes actually shown, in parallel.
  useEffect(() => {
    if (priorityRoutes.length === 0) {
      setStopSummaryByRouteId({});
      return;
    }

    let cancelled = false;
    async function loadStopSummaries() {
      const entries = await Promise.all(
        priorityRoutes.map(async (route) => {
          const { stops } = await getRouteWithStops(route.id);
          const signsTotal = stops.reduce(
            (sum, stop) => sum + (typeof stop.numberOfSigns === 'number' ? stop.numberOfSigns : 0),
            0
          );
          return [route.id, { stopCount: stops.length, signsTotal }] as const;
        })
      );
      if (!cancelled) {
        setStopSummaryByRouteId(Object.fromEntries(entries));
      }
    }
    void loadStopSummaries();
    return () => {
      cancelled = true;
    };
  }, [priorityRoutes]);

  const todayLabel = useMemo(
    () => new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }),
    []
  );
  const totalSigns = priorityRoutes.reduce(
    (sum, route) => sum + (stopSummaryByRouteId[route.id]?.signsTotal ?? 0),
    0
  );
  const todayLine = loading
    ? 'Loading today’s routes…'
    : `${todayLabel} · ${priorityRoutes.length} route${priorityRoutes.length === 1 ? '' : 's'} · ${totalSigns} sign${totalSigns === 1 ? '' : 's'}`;

  return (
    <div className={styles.page}>
      <PageHeader title="Today" subtitle={todayLine} />

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
            {priorityRoutes.map((route) => {
              const stopSummary = stopSummaryByRouteId[route.id];
              const phaseInfo = getSignRunPhase(route, stopSummary?.stopCount ?? 0);

              // Every phase ends back on Today with the card advanced to the next
              // phase; tapping a card still opens routes/detail today. Once the
              // Load/Placement/Pickup/Unload/Finalise pages exist (later PRs), this
              // is the spot to route to the phase-specific screen instead.
              if (phaseInfo) {
                return (
                  <SignRunRouteCard
                    key={route.id}
                    route={route}
                    customerName={customersById[route.customerId]}
                    phaseInfo={phaseInfo}
                    stopCount={stopSummary?.stopCount ?? 0}
                    signsTotal={stopSummary?.signsTotal ?? 0}
                  />
                );
              }

              return (
                <Link key={route.id} href={`/operator/routes/detail?id=${route.id}`} className={styles.trackerCard}>
                  <div className={styles.trackerTopRow}>
                    <strong>{route.routeCode || route.id.slice(0, 8)}</strong>
                    <RouteStatusPill status={route.status} />
                  </div>
                  <div className={styles.trackerMeta}>Created: {formatDate(route.createdAt)}</div>
                  <div className={styles.trackerAction}>Open Route</div>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
