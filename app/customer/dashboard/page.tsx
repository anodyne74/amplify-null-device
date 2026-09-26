'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useCurrentUserId } from '@/lib/use-user-groups';
import type { Customer } from '@/amplify/types';
import { fetchUserDisplayName } from '@/lib/amplify-config';
import { getUserSettings } from '@/lib/queries';
import { useCustomerPortalContext, type CustomerPortalContext } from '@/lib/useCustomerPortalContext';
import { useLiveRoutes } from '@/lib/useLiveRoutes';
import { unwrapOrThrow } from '@/lib/graphqlResult';
import { listCustomerStops } from '@/lib/routes';
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
import { getCustomer } from '@/lib/customers';
import { listMyInvoices } from '@/lib/invoices';

function presentationOf(route: OverviewRoute) {
  return getRouteStatusPresentation(route as unknown as RoutePhaseInput);
}

const ROUTE_STATUS_TONE: Record<RoutePhaseKey, BadgeProps['tone']> = {
  planned: 'neutral',
  signs_loaded: 'info',
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

interface DashboardData {
  stops: OverviewStop[];
  invoices: OverviewInvoice[];
}

async function fetchDashboardData(context: CustomerPortalContext): Promise<DashboardData> {
  const nextCustomer = unwrapOrThrow(await getCustomer(context.customerId), 'Could not load customer defaults.') as Customer | null;
  if (!nextCustomer) {
    return { stops: [], invoices: [] };
  }

  const stopResult = await listCustomerStops(context.customerId);
  const stops = ((stopResult.data as unknown as OverviewStop[]) ?? []).filter(Boolean);

  let invoices: OverviewInvoice[] = [];
  if (context.role === 'account_owner') {
    const invoiceResult = await listMyInvoices({
      customerId: context.customerId,
      userSub: context.userId,
    });
    invoices = (invoiceResult.data as OverviewInvoice[]) ?? [];
  }

  return { stops, invoices };
}

/**
 * Customer Dashboard
 * Shows overview of routes, invoices, and statistics
 */
export default function CustomerDashboard() {
  const userId = useCurrentUserId();
  const [fallbackDisplayName, setFallbackDisplayName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const {
    role: customerRole,
    error: customerLoadError,
    loading: dataLoading,
    data,
    customerId,
  } = useCustomerPortalContext({
    fetchData: fetchDashboardData,
    // account_owner while loading matches the pre-refactor default: every
    // stat tile below is individually gated on statsLoading, not this role,
    // so this only picks which tile layout briefly shows before it resolves.
    defaultRole: 'account_owner',
  });
  const { routes, loading: routesLoading, error: routesError } = useLiveRoutes(customerId);
  const statsLoading = dataLoading || routesLoading;
  const stops = useMemo(() => data?.stops ?? [], [data]);
  const invoices = useMemo(() => data?.invoices ?? [], [data]);

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

      {(customerLoadError || routesError) && (
        <p className="nd-badge nd-badge--danger">{customerLoadError || routesError}</p>
      )}

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
          <div className="nd-table-scroll">
            <DataTable wrapped={false} columns={agentColumns} rows={agentActivity} empty="No agent activity yet." />
          </div>
        </Card>
      ) : (
        <Card title="Recent routes" padded={false}>
          <div className="nd-table-scroll">
            <DataTable
              wrapped={false}
              columns={recentRouteColumns}
              rows={recentRoutes}
              empty="No routes are available for review."
            />
          </div>
        </Card>
      )}
    </div>
  );
}
