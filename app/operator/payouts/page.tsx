'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLiveAllRoutes } from '@/lib/useLiveRoutes';
import { useCurrentUserId } from '@/lib/use-user-groups';
import { useMyPayouts } from '@/lib/useMyPayouts';
import { listAllCustomers } from '@/lib/customers';
import { payoutDate, summarisePayouts, type MonthSummary, type PayoutPeriodSummary } from '@/lib/payoutSummary';
import PageHeader from '@/app/operator/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Badge } from '@/app/components/ui/core/Badge';
import { StatTile } from '@/app/components/ui/data/StatTile';
import { DataTable, type DataColumn } from '@/app/components/ui/data/DataTable';
import type { OperatorPayout } from '@/amplify/types';
import styles from './page.module.css';

const money = (value: number | null) => (value === null ? '—' : `$${value.toFixed(2)}`);

function monthLabel(key: string) {
  return new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function dayLabel(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function SummaryTiles({ summary, loading }: { summary: PayoutPeriodSummary; loading: boolean }) {
  const value = (v: string | number) => (loading ? '…' : v);
  return (
    <div className={styles.statsGrid}>
      <StatTile label="Paid" value={value(money(summary.paid))} icon="wallet" />
      <StatTile label="Outstanding" value={value(money(summary.outstanding))} icon="timer" />
      <StatTile label="Routes completed" value={value(summary.routesCompleted)} icon="route" />
      <StatTile label="Average per route" value={value(money(summary.averagePerRoute))} icon="chart-column" />
      <StatTile label="Largest payout" value={value(money(summary.largest))} icon="trending-up" />
    </div>
  );
}

const MONTH_COLUMNS: DataColumn<MonthSummary & { id: string }>[] = [
  { key: 'month', header: 'Month', render: (row) => monthLabel(row.key) },
  { key: 'paid', header: 'Paid', numeric: true, render: (row) => money(row.paid) },
  { key: 'outstanding', header: 'Outstanding', numeric: true, render: (row) => money(row.outstanding) },
  { key: 'routes', header: 'Routes', numeric: true, render: (row) => row.routesCompleted },
  { key: 'average', header: 'Average per route', numeric: true, render: (row) => money(row.averagePerRoute) },
  { key: 'largest', header: 'Largest', numeric: true, render: (row) => money(row.largest) },
];

/**
 * Operator Payouts: the signed-in Operator's own Payouts (all an Operator can
 * read), summarised for all time, the year to date and each month.
 */
export default function OperatorPayoutsPage() {
  const currentUserId = useCurrentUserId();
  const { payouts, loading: payoutsLoading, error } = useMyPayouts();
  const { routes, loading: routesLoading } = useLiveAllRoutes();
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const loading = payoutsLoading || routesLoading;

  useEffect(() => {
    // Best-effort: without names the list shows no Customer.
    void listAllCustomers()
      .then((customers) => setCustomerNames(Object.fromEntries(customers.map((c) => [c.id, c.name]))))
      .catch(() => undefined);
  }, []);

  // Only Routes assigned to this Operator count; an unassigned Route is nobody's yet.
  const myRoutes = useMemo(
    () => routes.filter((route) => currentUserId && route.assignedOperatorSub === currentUserId),
    [routes, currentUserId]
  );
  const summary = useMemo(() => summarisePayouts(payouts, myRoutes), [payouts, myRoutes]);
  const monthRows = useMemo(() => summary.months.map((month) => ({ ...month, id: month.key })), [summary.months]);
  const sortedPayouts = useMemo(
    () => [...payouts].sort((a, b) => (payoutDate(b)?.day ?? '').localeCompare(payoutDate(a)?.day ?? '')),
    [payouts]
  );

  const payoutColumns: DataColumn<OperatorPayout>[] = [
    {
      key: 'date',
      header: 'Period',
      render: (row) => {
        const date = payoutDate(row);
        if (!date) return '—';
        return (
          <>
            {row.periodStartDate && row.periodStartDate !== row.periodEndDate
              ? `${dayLabel(row.periodStartDate.slice(0, 10))} – ${dayLabel(date.day)}`
              : dayLabel(date.day)}
            {date.estimated && <span className={styles.estimated}> (date estimated)</span>}
          </>
        );
      },
    },
    { key: 'customer', header: 'Customer', render: (row) => customerNames[row.customerId] ?? '—' },
    { key: 'amount', header: 'Amount', numeric: true, render: (row) => money(row.amount) },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={row.status === 'paid' ? 'success' : 'warning'} dot>
          {row.status === 'paid' ? 'Paid' : 'Pending'}
        </Badge>
      ),
    },
    { key: 'paidAt', header: 'Paid on', render: (row) => (row.paidAt ? dayLabel(row.paidAt.slice(0, 10)) : '—') },
  ];

  return (
    <div className={styles.page}>
      <PageHeader title="Payouts" subtitle="What you have been paid, and what is still to come." />

      {error && <p className={styles.errorText}>Could not load payouts. {error}</p>}

      <Card title="All time">
        <SummaryTiles summary={summary.allTime} loading={loading} />
      </Card>

      <Card title="Year to date">
        <SummaryTiles summary={summary.yearToDate} loading={loading} />
      </Card>

      <Card title="By month" padded={false}>
        <DataTable
          columns={MONTH_COLUMNS}
          rows={loading ? [] : monthRows}
          wrapped={false}
          empty={loading ? 'Loading…' : 'No payouts or completed routes yet'}
        />
      </Card>

      <Card title="All payouts" padded={false}>
        <DataTable
          columns={payoutColumns}
          rows={loading ? [] : sortedPayouts}
          wrapped={false}
          empty={loading ? 'Loading…' : 'No payouts yet'}
        />
      </Card>
    </div>
  );
}
