'use client';

import { useEffect, useMemo, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import { listAllRoutes } from '@/lib/queries/ListAllRoutes';
import { listAllStops } from '@/lib/queries/ListAllStops';
import { listInvoices, listCustomerUsers } from '@/lib/queries';
import type { Route } from '@/amplify/types';
import OperatorRoute from '@/app/components/OperatorRoute';
import PageHeader from '@/app/administrator/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Badge, type BadgeProps } from '@/app/components/ui/core/Badge';
import { StatTile } from '@/app/components/ui/data/StatTile';
import { DataTable, type DataColumn } from '@/app/components/ui/data/DataTable';
import { aggregateRouteData } from '@/lib/aggregateRouteData';
import { formatCurrency } from '@/lib/dashboardAnalytics';
import {
  summarizeBilledThisMonth,
  summarizeRoutesStopsThisMonth,
  summarizeOutstanding,
  summarizeSignsInField,
  summarizeRouteStatusCounts,
  summarizeCustomersByVolume,
  summarizeNeedsAttention,
  formatWeekLabel,
  ROUTE_STATUS_ORDER,
  type OrderedRouteStatus,
  type CustomerVolumeRow,
  type OverviewCustomerUser,
} from '@/lib/adminDashboardOverview';
import styles from './page.module.css';

type Invoice = {
  id: string;
  customerId?: string | null;
  totalAmount: number;
  invoiceDate?: string | null;
  createdAt?: string | null;
  status?: 'draft' | 'finalized' | 'sent' | 'paid' | null;
  emailSentAt?: string | null;
};

type CustomerSummary = {
  id: string;
  name?: string | null;
};

type StopSummary = {
  id: string;
  routeId?: string | null;
  numberOfSigns?: number | null;
};

const ROUTE_STATUS_META: Record<OrderedRouteStatus, { label: string; tone: BadgeProps['tone'] }> = {
  planned: { label: 'Planned', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'info' },
  signs_placed: { label: 'Signs placed', tone: 'brand' },
  signs_picked_up: { label: 'Signs picked up', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
};

const ATTENTION_DOT_CLASS: Record<'danger' | 'warning', string> = {
  danger: styles.attentionDotDanger,
  warning: styles.attentionDotWarning,
};

function formatCompactCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount);
}

const customerVolumeColumns: DataColumn<CustomerVolumeRow>[] = [
  { key: 'name', header: 'Customer' },
  { key: 'routes', header: 'Routes', numeric: true },
  { key: 'stops', header: 'Stops', numeric: true },
  { key: 'signs', header: 'Signs', numeric: true },
  { key: 'billed', header: 'Billed', numeric: true, render: (row) => formatCurrency(row.billed) },
];

export default function AdminHomePage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [stops, setStops] = useState<StopSummary[]>([]);
  const [customerUsers, setCustomerUsers] = useState<OverviewCustomerUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      try {
        const fetchAllRoutes = async () => {
          const allRoutes: Route[] = [];
          let nextToken: string | undefined;

          do {
            const pageResult = await listAllRoutes({ limit: 500, nextToken });
            if (pageResult.errors && pageResult.errors.length > 0) {
              return { data: [] as Route[], errors: pageResult.errors };
            }

            allRoutes.push(...((pageResult.data as Route[]) || []));
            nextToken = pageResult.nextToken ?? undefined;
          } while (nextToken);

          return { data: allRoutes, errors: undefined };
        };

        const fetchAllInvoices = async () => {
          const allInvoices: Invoice[] = [];
          let nextToken: string | undefined;

          do {
            const pageResult = await listInvoices({ limit: 500, nextToken });
            if (pageResult.errors && pageResult.errors.length > 0) {
              return { data: [] as Invoice[], errors: pageResult.errors };
            }

            allInvoices.push(...((pageResult.data as Invoice[]) || []));
            nextToken = pageResult.nextToken ?? undefined;
          } while (nextToken);

          return { data: allInvoices, errors: undefined };
        };

        const fetchAllCustomers = async () => {
          const client = generateClient<Schema>();
          const allCustomers: CustomerSummary[] = [];
          let nextToken: string | undefined;

          do {
            const pageResult = await client.models.Customer.list({ limit: 200, nextToken });
            if (pageResult.errors && pageResult.errors.length > 0) {
              return { data: [] as CustomerSummary[], errors: pageResult.errors };
            }

            allCustomers.push(...((pageResult.data as CustomerSummary[]) ?? []));
            nextToken = pageResult.nextToken ?? undefined;
          } while (nextToken);

          return { data: allCustomers, errors: undefined };
        };

        const fetchAllStops = async () => {
          const allStops: StopSummary[] = [];
          let nextToken: string | undefined;

          do {
            const pageResult = await listAllStops({ limit: 500, nextToken });
            if (pageResult.errors && pageResult.errors.length > 0) {
              return { data: [] as StopSummary[], errors: pageResult.errors };
            }

            allStops.push(...((pageResult.data as StopSummary[]) || []));
            nextToken = pageResult.nextToken ?? undefined;
          } while (nextToken);

          return { data: allStops, errors: undefined };
        };

        const [routeResult, invoiceResult, customerResult, stopResult] = await Promise.all([
          fetchAllRoutes(),
          fetchAllInvoices(),
          fetchAllCustomers(),
          fetchAllStops(),
        ]);

        if (!routeResult.errors || routeResult.errors.length === 0) {
          setRoutes((routeResult.data as Route[]) || []);
        }
        if (!invoiceResult.errors || invoiceResult.errors.length === 0) {
          setInvoices((invoiceResult.data as Invoice[]) || []);
        }
        if (!stopResult.errors || stopResult.errors.length === 0) {
          setStops((stopResult.data as StopSummary[]) || []);
        }

        let loadedCustomers: CustomerSummary[] = [];
        if (!customerResult.errors || customerResult.errors.length === 0) {
          loadedCustomers = customerResult.data ?? [];
          setCustomers(loadedCustomers);
        }

        // Account-owner presence is only knowable per customer — fan out once customer ids are known.
        if (loadedCustomers.length > 0) {
          const userResults = await Promise.all(loadedCustomers.map((customer) => listCustomerUsers(customer.id)));
          const allUsers: OverviewCustomerUser[] = userResults.flatMap((result) =>
            !result.errors || (result.errors as unknown[]).length === 0
              ? ((result.data ?? []) as OverviewCustomerUser[])
              : []
          );
          setCustomerUsers(allUsers);
        }
      } catch { /* dashboard stats are best-effort */ }
      setLoading(false);
    }
    void loadDashboard();
  }, []);

  const billed = useMemo(() => summarizeBilledThisMonth(invoices), [invoices]);
  const routesStops = useMemo(() => summarizeRoutesStopsThisMonth(routes, stops), [routes, stops]);
  const outstanding = useMemo(() => summarizeOutstanding(invoices), [invoices]);
  const signsInField = useMemo(() => summarizeSignsInField(routes, stops), [routes, stops]);
  const routeStatusCounts = useMemo(() => summarizeRouteStatusCounts(routes), [routes]);
  const customersByVolume = useMemo(
    () => summarizeCustomersByVolume(customers, routes, stops, invoices),
    [customers, routes, stops, invoices]
  );
  const needsAttention = useMemo(
    () => summarizeNeedsAttention(invoices, customers, customerUsers),
    [invoices, customers, customerUsers]
  );

  const weeklyBillings = useMemo(() => aggregateRouteData(routes, invoices, 'week').slice(-5), [routes, invoices]);
  const maxWeeklyRevenue = Math.max(1, ...weeklyBillings.map((week) => week.totalRevenue));
  const maxStatusCount = Math.max(1, ...ROUTE_STATUS_ORDER.map((status) => routeStatusCounts[status]));

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.page}>
        <PageHeader
          title="Administrator Portal"
          subtitle="Manage customers, invoices, users, and route operations. Send invoices via email directly to customers."
        />

        <div className={styles.statsGrid}>
          <StatTile
            label="Billed this month"
            value={loading ? '…' : formatCurrency(billed.currentTotal)}
            delta={loading ? undefined : `${billed.deltaPercent}%`}
            direction={billed.direction}
            caption={`AUD, ex GST · ${billed.customerCount} customer${billed.customerCount === 1 ? '' : 's'}`}
            icon="receipt"
          />
          <StatTile
            label="Routes / stops"
            value={loading ? '…' : routesStops.currentRoutes}
            delta={loading ? undefined : `${routesStops.deltaPercent}%`}
            direction={routesStops.direction}
            caption={`${routesStops.stopsServiced.toLocaleString()} stops serviced`}
            icon="route"
          />
          <StatTile
            label="Outstanding"
            value={loading ? '…' : formatCurrency(outstanding.total)}
            caption={`${outstanding.pastDueCount} invoice${outstanding.pastDueCount === 1 ? '' : 's'} past due`}
            icon="triangle-alert"
          />
          <StatTile
            label="Signs in field"
            value={loading ? '…' : signsInField.toLocaleString()}
            caption="placed, not yet picked up"
            icon="map-pin"
          />
        </div>

        <div className={styles.mainGrid}>
          <Card title="Billings by week" subtitle="All customers, ex GST">
            {weeklyBillings.length === 0 ? (
              <p className={styles.emptyState}>No billing history yet.</p>
            ) : (
              <div className={styles.weeklyBars}>
                {weeklyBillings.map((week) => (
                  <div key={week.dateGroup} className={styles.weeklyBar}>
                    <span className={styles.weeklyBarValue}>{formatCompactCurrency(week.totalRevenue)}</span>
                    <div className={styles.weeklyBarTrack}>
                      <div
                        className={styles.weeklyBarFill}
                        style={{ height: `${Math.max(4, (week.totalRevenue / maxWeeklyRevenue) * 100)}%` }}
                      />
                    </div>
                    <span className={styles.weeklyBarLabel}>{formatWeekLabel(week.dateGroup)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Route status" subtitle="Across every customer">
            <div className={styles.statusRows}>
              {ROUTE_STATUS_ORDER.map((status) => {
                const count = routeStatusCounts[status];
                const meta = ROUTE_STATUS_META[status];
                return (
                  <div key={status} className={styles.statusRow}>
                    <Badge tone={meta.tone} className={styles.statusBadge}>{meta.label}</Badge>
                    <div className={styles.statusTrack}>
                      <div className={styles.statusFill} style={{ width: `${(count / maxStatusCount) * 100}%` }} />
                    </div>
                    <span className={styles.statusCount}>{count}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className={styles.mainGrid}>
          <Card title="Customers by volume" subtitle="Last 30 days" padded={false}>
            <DataTable
              wrapped={false}
              columns={customerVolumeColumns}
              rows={customersByVolume}
              empty="No customer activity in the last 30 days."
            />
          </Card>

          <Card title="Needs attention" subtitle="Money and access">
            {needsAttention.length === 0 ? (
              <p className={styles.emptyState}>Nothing needs attention right now.</p>
            ) : (
              <div className={styles.attentionList}>
                {needsAttention.map((item) => (
                  <div key={item.id} className={styles.attentionRow}>
                    <span className={`${styles.attentionDot} ${ATTENTION_DOT_CLASS[item.tone]}`} />
                    <div className={styles.attentionBody}>
                      <div className={styles.attentionTitle}>{item.title}</div>
                      <div className={styles.attentionDetail}>{item.detail}</div>
                    </div>
                    {item.amount && <span className={styles.attentionAmount}>{item.amount}</span>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </OperatorRoute>
  );
}
