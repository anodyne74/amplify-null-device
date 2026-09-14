'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useCurrentUserId } from '@/lib/use-user-groups';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import type { Customer, Route } from '@/amplify/types';
import { fetchUserDisplayName } from '@/lib/amplify-config';
import { getCustomer, getCustomerPortalContext, getUserSettings } from '@/lib/queries';
import { listMyInvoices } from '@/lib/queries/ListMyInvoices';
import { listMyRoutes } from '@/lib/queries/ListMyRoutes';
import { formatCurrency } from '@/lib/dashboardAnalytics';
import { getRouteStatusPresentation } from '@/lib/routeStatusHelpers';
import type { RoutePhaseInput, RoutePhaseKey } from '@/lib/signRunPhase';
import { summarizeOutstanding, summarizeSignsInField, formatWeekLabel } from '@/lib/adminDashboardOverview';
import {
  summarizePeriodActivity,
  summarizeCurrentRoute,
  summarizeStopsThisWeek,
  summarizeThisWeekListings,
  summarizeStopsByWeek,
  summarizeSpendByWeek,
  summarizeAgentActivity,
  summarizeLatestInvoice,
  type OverviewRoute,
  type OverviewStop,
  type OverviewInvoice,
} from '@/lib/customerDashboardOverview';
import PageHeader from '@/app/customer/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Badge, type BadgeProps } from '@/app/components/ui/core/Badge';
import { StatTile } from '@/app/components/ui/data/StatTile';
import { DataTable, type DataColumn } from '@/app/components/ui/data/DataTable';
import styles from './page.module.css';

function presentationOf(route: OverviewRoute) {
  return getRouteStatusPresentation(route as unknown as RoutePhaseInput);
}

const ROUTE_STATUS_TONE: Record<RoutePhaseKey, BadgeProps['tone']> = {
  planned: 'neutral',
  signs_collected: 'info',
  signs_placed: 'brand',
  signs_picked_up: 'warning',
  signs_returned: 'warning',
  completed: 'success',
};

interface RecentRouteRow {
  id: string;
  routeCode: string;
  badgeKey: RoutePhaseKey;
  statusLabel: string;
  stopCount: number;
  createdAt?: string | null;
}

/**
 * Customer Dashboard
 * Shows overview of routes, invoices, and statistics
 */
export default function CustomerDashboard() {
  const userId = useCurrentUserId();
  const [fallbackDisplayName, setFallbackDisplayName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [customerRole, setCustomerRole] = useState<'account_owner' | 'read_only'>('account_owner');
  const [customerLoadError, setCustomerLoadError] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [routes, setRoutes] = useState<OverviewRoute[]>([]);
  const [stops, setStops] = useState<OverviewStop[]>([]);
  const [invoices, setInvoices] = useState<OverviewInvoice[]>([]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    void fetchUserDisplayName().then((name) => {
      if (!cancelled) setFallbackDisplayName(name || '');
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    setDisplayName(fallbackDisplayName);
  }, [fallbackDisplayName]);

  useEffect(() => {
    if (!userId) return;
    if (typeof getUserSettings !== 'function') return;
    let cancelled = false;

    void getUserSettings(userId)
      .then((result) => {
        if (cancelled) return;
        const configuredName = result.data?.name?.trim();
        setDisplayName(configuredName || fallbackDisplayName);
      })
      .catch(() => {
        if (!cancelled) setDisplayName(fallbackDisplayName);
      });

    return () => {
      cancelled = true;
    };
  }, [fallbackDisplayName, userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    void getCustomerPortalContext(userId)
      .then(async (context) => {
        if (!cancelled) {
          setCustomerRole(context.role);
        }

        if (!context.customerId) {
          if (!cancelled) {
            setCustomerLoadError('Could not resolve your customer account.');
          }
          return;
        }

        const customerResult = await getCustomer(context.customerId);
        if (cancelled || (customerResult.errors && customerResult.errors.length > 0)) {
          if (!cancelled) {
            const firstError = customerResult.errors?.[0] as { message?: string } | undefined;
            setCustomerLoadError(firstError?.message ?? 'Could not load customer defaults.');
          }
          return;
        }

        const nextCustomer = customerResult.data as Customer | null;
        if (!nextCustomer) {
          return;
        }

        setStatsLoading(true);
        const routesResult = await listMyRoutes({ customerId: context.customerId, limit: 500 });
        const fetchedRoutes = (routesResult.data as Route[]) ?? [];
        if (!cancelled) {
          setRoutes(fetchedRoutes);
        }

        const client = generateClient<Schema>();
        const stopResult = await client.models.Stop.list({
          filter: { customerId: { eq: context.customerId } },
          limit: 1000,
        });
        const customerStops = ((stopResult.data as unknown as OverviewStop[]) ?? []).filter(Boolean);
        if (!cancelled) {
          setStops(customerStops);
        }

        if (context.role === 'account_owner') {
          const invoiceResult = await listMyInvoices({
            customerId: context.customerId,
            userSub: userId,
            limit: 500,
          });
          if (!cancelled) {
            setInvoices((invoiceResult.data as OverviewInvoice[]) ?? []);
          }
        } else if (!cancelled) {
          setInvoices([]);
        }

        if (!cancelled) {
          setStatsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCustomerRole('account_owner');
          setStatsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const isAccountOwner = customerRole === 'account_owner';

  const periodActivity = useMemo(() => summarizePeriodActivity(routes, stops, invoices), [routes, stops, invoices]);
  const outstanding = useMemo(() => summarizeOutstanding(invoices), [invoices]);
  const currentRoute = useMemo(() => summarizeCurrentRoute(routes), [routes]);
  const signsInField = useMemo(() => summarizeSignsInField(routes, stops), [routes, stops]);
  const stopsThisWeek = useMemo(() => summarizeStopsThisWeek(stops), [stops]);
  const weekListings = useMemo(() => summarizeThisWeekListings(stops, routes), [stops, routes]);
  const stopsByWeek = useMemo(() => summarizeStopsByWeek(stops), [stops]);
  const agentActivity = useMemo(() => summarizeAgentActivity(stops), [stops]);
  const latestInvoice = useMemo(() => summarizeLatestInvoice(invoices), [invoices]);

  const stopCountsByRouteId = useMemo(() => {
    const counts = new Map<string, number>();
    stops.forEach((stop) => {
      if (!stop.routeId) return;
      counts.set(stop.routeId, (counts.get(stop.routeId) || 0) + 1);
    });
    return counts;
  }, [stops]);

  const recentRoutes = useMemo<RecentRouteRow[]>(
    () =>
      [...routes]
        .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
        .slice(0, 8)
        .map((route) => {
          const { badgeKey, label } = presentationOf(route);
          return {
            id: route.id,
            routeCode: route.routeCode || route.id.slice(0, 8),
            badgeKey,
            statusLabel: label,
            stopCount: stopCountsByRouteId.get(route.id) || 0,
            createdAt: route.createdAt,
          };
        }),
    [routes, stopCountsByRouteId]
  );

  const spendByWeek = useMemo(() => summarizeSpendByWeek(invoices), [invoices]);
  const maxSpend = Math.max(1, ...spendByWeek.map((w) => w.amount));
  const maxStops = Math.max(1, ...stopsByWeek.map((w) => w.stops));

  const recentRouteColumns: DataColumn<RecentRouteRow>[] = [
    { key: 'routeCode', header: 'Route' },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={ROUTE_STATUS_TONE[row.badgeKey]} size="sm">
          {row.statusLabel}
        </Badge>
      ),
    },
    { key: 'stopCount', header: 'Stops', numeric: true },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row) =>
        row.createdAt
          ? new Date(row.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
          : '—',
    },
    {
      key: 'view',
      header: '',
      render: (row) => (
        <Link href={`/customer/routes/${row.id}`} className="nd-btn nd-btn--ghost nd-btn--sm">
          View
        </Link>
      ),
    },
  ];

  const agentColumns: DataColumn<(typeof agentActivity)[number]>[] = [
    { key: 'agent', header: 'Agent' },
    { key: 'stops', header: 'Stops', numeric: true },
    { key: 'signs', header: 'Signs', numeric: true },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Dashboard"
        subtitle={`Welcome,${displayName ? ` ${displayName}` : ''} · ${isAccountOwner ? 'Owner' : 'Reviewer'}`}
      />

      {customerLoadError && <p className="nd-badge nd-badge--danger">{customerLoadError}</p>}

      <div className={styles.statsGrid}>
        {isAccountOwner ? (
          <>
            <StatTile
              label="Invoiced this month"
              value={statsLoading ? '…' : formatCurrency(periodActivity.invoicedCurrent)}
              delta={statsLoading ? undefined : `${periodActivity.invoicedDeltaPercent}%`}
              direction={periodActivity.invoicedDirection}
              icon="receipt"
            />
            <StatTile
              label="Outstanding"
              value={statsLoading ? '…' : formatCurrency(outstanding.total)}
              caption={`${outstanding.pastDueCount} invoice${outstanding.pastDueCount === 1 ? '' : 's'} past due`}
              icon="triangle-alert"
            />
            <StatTile
              label="Routes completed"
              value={statsLoading ? '…' : periodActivity.routesCompletedCurrent}
              delta={statsLoading ? undefined : `${periodActivity.routesCompletedDeltaPercent}%`}
              direction={periodActivity.routesCompletedDirection}
              caption={`${periodActivity.stopsServiced} stops · ${periodActivity.signsHandled} signs`}
              icon="route"
            />
            <StatTile
              label="Avg cost per stop"
              value={statsLoading ? '…' : formatCurrency(periodActivity.avgCostPerStop)}
              delta={statsLoading ? undefined : `${periodActivity.avgCostPerStopDeltaPercent}%`}
              direction={periodActivity.avgCostPerStopDirection}
              icon="map-pin"
            />
          </>
        ) : (
          <>
            <StatTile
              label="Current route"
              value={statsLoading ? '…' : currentRoute ? currentRoute.routeCode || currentRoute.id.slice(0, 8) : '—'}
              caption={statsLoading || !currentRoute ? undefined : presentationOf(currentRoute).label}
              icon="route"
            />
            <StatTile
              label="Signs in field"
              value={statsLoading ? '…' : signsInField.toLocaleString()}
              caption="placed, not yet picked up"
              icon="map-pin"
            />
            <StatTile label="Stops this week" value={statsLoading ? '…' : stopsThisWeek} icon="calendar" />
          </>
        )}
      </div>

      <div className={styles.mainGrid}>
        {isAccountOwner ? (
          <Card title="Spend by week" subtitle="Invoiced, ex GST">
            {spendByWeek.length === 0 ? (
              <p className={styles.emptyState}>No billing history yet.</p>
            ) : (
              <div className={styles.weeklyBars}>
                {spendByWeek.map((week) => (
                  <div key={week.weekStart} className={styles.weeklyBar}>
                    <span className={styles.weeklyBarValue}>{formatCurrency(week.amount)}</span>
                    <div className={styles.weeklyBarTrack}>
                      <div
                        className={styles.weeklyBarFill}
                        style={{ height: `${Math.max(4, (week.amount / maxSpend) * 100)}%` }}
                      />
                    </div>
                    <span className={styles.weeklyBarLabel}>{formatWeekLabel(week.weekStart)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ) : (
          <Card title="Stops serviced by week">
            {stopsByWeek.length === 0 ? (
              <p className={styles.emptyState}>No stop history yet.</p>
            ) : (
              <>
                <div className={styles.weeklyBars}>
                  {stopsByWeek.map((week) => (
                    <div key={week.weekStart} className={styles.weeklyBar}>
                      <span className={styles.weeklyBarValue}>{week.stops}</span>
                      <div className={styles.weeklyBarTrack}>
                        <div
                          className={styles.weeklyBarFill}
                          style={{ height: `${Math.max(4, (week.stops / maxStops) * 100)}%` }}
                        />
                      </div>
                      <span className={styles.weeklyBarLabel}>{formatWeekLabel(week.weekStart)}</span>
                    </div>
                  ))}
                </div>
                <p className={styles.chartNote}>Costs sit with your account owner — invoices aren&apos;t shown here.</p>
              </>
            )}
          </Card>
        )}

        {isAccountOwner ? (
          <Card
            title="Latest invoice"
            footer={
              <Link href="/customer/invoices" className="nd-btn nd-btn--secondary nd-btn--sm">
                See billing history
              </Link>
            }
          >
            {statsLoading ? (
              <p className={styles.mutedText}>Loading…</p>
            ) : !latestInvoice ? (
              <p className={styles.mutedText}>No invoices yet.</p>
            ) : (
              <div className={styles.invoiceSummary}>
                <span className={styles.invoiceAmount}>{formatCurrency(latestInvoice.totalAmount)}</span>
                <Badge tone={latestInvoice.status === 'paid' ? 'success' : 'info'} size="sm">
                  {latestInvoice.status}
                </Badge>
                <span className={styles.invoiceMeta}>
                  {latestInvoice.invoiceDate
                    ? new Date(latestInvoice.invoiceDate).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : 'Date unavailable'}
                </span>
              </div>
            )}
          </Card>
        ) : (
          <Card title="This week">
            {weekListings.length === 0 ? (
              <p className={styles.mutedText}>No activity recorded this week.</p>
            ) : (
              <div className={styles.weekList}>
                {weekListings.map((row) => (
                  <div key={row.id} className={styles.weekRow}>
                    <Badge tone={ROUTE_STATUS_TONE[row.phaseKey]} size="sm">
                      {row.phaseKey.replace(/_/g, ' ')}
                    </Badge>
                    <div className={styles.weekRowBody}>
                      <div className={styles.weekRowLabel}>{row.label}</div>
                      <div className={styles.weekRowWhen}>{row.when}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      {isAccountOwner ? (
        <Card title="Spend by agent" subtitle="Stops and signs on-charged, by agent" padded={false}>
          <DataTable wrapped={false} columns={agentColumns} rows={agentActivity} empty="No agent activity yet." />
        </Card>
      ) : (
        <Card title="Recent routes" padded={false}>
          <DataTable
            wrapped={false}
            columns={recentRouteColumns}
            rows={recentRoutes}
            empty="No routes are available for review."
          />
        </Card>
      )}
    </div>
  );
}
