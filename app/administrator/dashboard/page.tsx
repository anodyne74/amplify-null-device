'use client';

import { useEffect, useMemo, useState } from 'react';
import React from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import { listAllRoutes } from '@/lib/queries/ListAllRoutes';
import { listInvoices } from '@/lib/queries';
import type { Route } from '@/amplify/types';
import OperatorRoute from '@/app/components/OperatorRoute';
import styles from '@/app/dashboard.module.css';
import PeriodSelector from '../../components/PeriodSelector';
import KpiCard from '../../components/KpiCard';
import {
  aggregateRouteData,
  getDateGroup,
  getPreviousDateGroup,
  type AnalyticsPeriod,
} from '@/lib/aggregateRouteData';

type Invoice = {
  id: string;
  totalAmount: number;
  invoiceDate?: string | null;
  createdAt?: string | null;
  status?: 'draft' | 'finalized' | 'sent' | 'paid' | null;
  emailSentAt?: string | null;
};

function getDeltaPercent(current: number, previous: number): number {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }

  return Math.round(((current - previous) / previous) * 100);
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}:${mins.toString().padStart(2, '0')}:00`;
}

function formatPeriodDisplay(periodKey: string, period: AnalyticsPeriod): string {
  if (period === 'quarter') return periodKey;
  if (period === 'year') return periodKey;
  if (period === 'month') return periodKey;
  return periodKey;
}

function formatPeriodSummary(period: AnalyticsPeriod, date = new Date()): string {
  if (period === 'week') {
    const start = new Date(date);
    start.setDate(date.getDate() - date.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `Week ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`;
  }

  if (period === 'month') {
    return date.toLocaleString('en-AU', { month: 'long', year: 'numeric' });
  }

  if (period === 'quarter') {
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `Quarter ${quarter} ${date.getFullYear()}`;
  }

  return `Year ${date.getFullYear()}`;
}

export default function AdminHomePage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customerCount, setCustomerCount] = useState<number | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [totalStops, setTotalStops] = useState(0);
  const [totalSigns, setTotalSigns] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = React.useState<'week' | 'month' | 'quarter' | 'year'>('week');

  useEffect(() => {
    async function loadStats() {
      setStatsLoading(true);
      try {
        const [routeResult, invoiceResult, customerResult] = await Promise.all([
          listAllRoutes({ limit: 500 }),
          listInvoices({ limit: 500 }),
          generateClient<Schema>().models.Customer.list({ limit: 200 }),
        ]);
        if (!routeResult.errors || routeResult.errors.length === 0) {
          setRoutes((routeResult.data as Route[]) || []);
        }
        if (!invoiceResult.errors || invoiceResult.errors.length === 0) {
          setInvoices((invoiceResult.data as Invoice[]) || []);
        }
        if (!customerResult.errors || customerResult.errors.length === 0) {
          setCustomerCount(customerResult.data?.length ?? 0);
        }

        const client = generateClient<Schema>();
        const allStops = await client.models.Stop.list({ limit: 2000 });
        const stopList = (allStops.data as unknown as Array<{ numberOfSigns?: number | null }>) ?? [];
        setTotalStops(stopList.length);
        setTotalSigns(stopList.reduce((sum, s) => sum + (typeof s.numberOfSigns === 'number' ? s.numberOfSigns : 0), 0));
      } catch { /* stats are best-effort */ }
      setStatsLoading(false);
    }
    void loadStats();
  }, []);

  const activeRoutes = useMemo(
    () => routes.filter((r) => r.status === 'in_progress' || r.status === 'signs_placed' || r.status === 'signs_picked_up'),
    [routes]
  );
  const plannedRoutes = useMemo(() => routes.filter((r) => r.status === 'planned'), [routes]);
  const completedToday = useMemo(() => {
    const today = new Date().toDateString();
    return routes.filter(
      (r) => r.status === 'completed' && r.actualEndTime && new Date(r.actualEndTime).toDateString() === today
    );
  }, [routes]);

  const unsentInvoices = useMemo(
    () => invoices.filter((inv) => inv.status !== 'sent' && inv.status !== 'paid'),
    [invoices]
  );

  const completedRoutesForAnalytics = useMemo(
    () => routes.filter((route) => route.status === 'completed'),
    [routes]
  );

  const groupedAnalytics = useMemo(
    () => aggregateRouteData(completedRoutesForAnalytics, invoices, selectedPeriod as AnalyticsPeriod),
    [completedRoutesForAnalytics, invoices, selectedPeriod]
  );

  const currentPeriodKey = useMemo(
    () => getDateGroup(new Date().toISOString(), selectedPeriod as AnalyticsPeriod),
    [selectedPeriod]
  );

  const previousPeriodKey = useMemo(
    () => getPreviousDateGroup(new Date(), selectedPeriod as AnalyticsPeriod),
    [selectedPeriod]
  );

  const analyticsByPeriod = useMemo(
    () => Object.fromEntries(groupedAnalytics.map((item) => [item.dateGroup, item])),
    [groupedAnalytics]
  );

  const currentAnalytics = analyticsByPeriod[currentPeriodKey];
  const previousAnalytics = analyticsByPeriod[previousPeriodKey];

  const routesCompletedKpi = currentAnalytics?.routesCompleted ?? 0;
  const totalRevenueKpi = currentAnalytics?.totalRevenue ?? 0;
  const totalDistanceKpi = currentAnalytics?.totalDistanceKm ?? 0;
  const avgRevenuePerRouteKpi = routesCompletedKpi > 0 ? totalRevenueKpi / routesCompletedKpi : 0;
  const routesDelta = getDeltaPercent(routesCompletedKpi, previousAnalytics?.routesCompleted ?? 0);
  const revenueDelta = getDeltaPercent(totalRevenueKpi, previousAnalytics?.totalRevenue ?? 0);
  const distanceDelta = getDeltaPercent(totalDistanceKpi, previousAnalytics?.totalDistanceKm ?? 0);
  const previousRoutesCompletedKpi = previousAnalytics?.routesCompleted ?? 0;
  const previousRevenueKpi = previousAnalytics?.totalRevenue ?? 0;
  const previousDistanceKpi = previousAnalytics?.totalDistanceKm ?? 0;
  const previousAvgRevenuePerRouteKpi =
    previousRoutesCompletedKpi > 0 ? previousRevenueKpi / previousRoutesCompletedKpi : 0;
  const periodLabel = formatPeriodDisplay(currentPeriodKey, selectedPeriod as AnalyticsPeriod);
  const periodSummary = formatPeriodSummary(selectedPeriod as AnalyticsPeriod);

  const completedRoutes = []; // Placeholder for completed routes data
  const totalCompletedDistance = 0; // Placeholder for total completed distance
  const totalCompletedHours = 0; // Placeholder for total completed hours
  const totalInvoicedAmount = 0; // Placeholder for total invoiced amount
  const totalOutstandingBalance = 0; // Placeholder for total outstanding balance

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.page}>
        <div>
          <h1 className={styles.heading}>Administrator Portal</h1>
          <p className={styles.welcome}>Manage customers, invoices, users, and route operations. Send invoices via email directly to customers.</p>
        </div>

        <div className={styles.controlsRow}>
          <PeriodSelector selectedPeriod={selectedPeriod} onChange={setSelectedPeriod} />
        </div>

        {/* Dashboard cards grid */}
        <div className={styles.statsGrid}>
          {/* Active Routes + All Routes */}
          <div className={styles.cardColumn}>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Active Routes</p>
              <p className={`${styles.statValue} ${styles.green}`}>
                {statsLoading ? '…' : activeRoutes.length}
              </p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Total Routes</p>
              <p className={`${styles.statValue} ${styles.amber}`}>
                {statsLoading ? '…' : routes.length}
              </p>
            </div>
          </div>

          {/* Planned Routes + Generate Invoices */}
          <div className={styles.cardColumn}>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Planned Routes</p>
              <p className={`${styles.statValue} ${styles.cyan}`}>
                {statsLoading ? '…' : plannedRoutes.length}
              </p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Total Invoices</p>
              <p className={`${styles.statValue} ${styles.green}`}>
                {statsLoading ? '…' : invoices.length}
              </p>
            </div>
          </div>

          {/* Completed Today + Manage Users */}
          <div className={styles.cardColumn}>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Completed Today</p>
              <p className={`${styles.statValue} ${styles.amber}`}>
                {statsLoading ? '…' : completedToday.length}
              </p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Completed Routes</p>
              <p className={`${styles.statValue} ${styles.danger}`}>
                {statsLoading ? '…' : completedRoutes.length}
              </p>
            </div>
          </div>

          {/* Customers + Define Customers */}
          <div className={styles.cardColumn}>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Customers</p>
              <p className={`${styles.statValue} ${styles.cyan}`}>
                {statsLoading ? '…' : customerCount ?? '—'}
              </p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Total Stops</p>
              <p className={`${styles.statValue} ${styles.cyan}`}>
                {statsLoading ? '…' : totalStops}
              </p>
            </div>
          </div>

          {/* Unsent Invoices + Send Invoice */}
          <div className={styles.cardColumn}>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Unsent Invoices</p>
              <p className={`${styles.statValue} ${styles.danger}`}>
                {statsLoading ? '…' : unsentInvoices.length}
              </p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Total Signs</p>
              <p className={`${styles.statValue} ${styles.green}`}>
                {statsLoading ? '…' : totalSigns}
              </p>
            </div>
          </div>
        </div>

        {/* Total Statistics Section */}
        <div className={styles.infoPanel}>
          <h3>Total Statistics</h3>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Jobs Completed</p>
              <p className={`${styles.statValue} ${styles.green}`}>
                {statsLoading ? '…' : completedRoutes.length}
              </p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Total Distance</p>
              <p className={`${styles.statValue} ${styles.amber}`}>
                {statsLoading ? '…' : `${totalCompletedDistance.toFixed(1)} km`}
              </p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Total Stops</p>
              <p className={`${styles.statValue} ${styles.cyan}`}>
                {statsLoading ? '…' : totalStops}
              </p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Total Signs</p>
              <p className={`${styles.statValue} ${styles.danger}`}>
                {statsLoading ? '…' : totalSigns}
              </p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Total Hours</p>
              <p className={`${styles.statValue} ${styles.green}`}>
                {statsLoading ? '…' : formatDuration(totalCompletedHours)}
              </p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Invoiced Amount</p>
              <p className={`${styles.statValue} ${styles.cyan}`}>
                {statsLoading ? '…' : formatCurrency(totalInvoicedAmount)}
              </p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Outstanding Amount</p>
              <p className={`${styles.statValue} ${styles.danger}`}>
                {statsLoading ? '…' : formatCurrency(totalOutstandingBalance)}
              </p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Average Per Job</p>
              <p className={`${styles.statValue} ${styles.amber}`}>
                {statsLoading || completedRoutes.length === 0 ? '…' : formatCurrency(totalInvoicedAmount / completedRoutes.length)}
              </p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Average Per Stop</p>
              <p className={`${styles.statValue} ${styles.cyan}`}>
                {statsLoading || totalStops === 0 ? '…' : formatCurrency(totalInvoicedAmount / totalStops)}
              </p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Average Per Sign</p>
              <p className={`${styles.statValue} ${styles.green}`}>
                {statsLoading || totalSigns === 0 ? '…' : formatCurrency(totalInvoicedAmount / totalSigns)}
              </p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Average Per Kilometer</p>
              <p className={`${styles.statValue} ${styles.amber}`}>
                {statsLoading || totalCompletedDistance === 0 ? '…' : formatCurrency(totalInvoicedAmount / totalCompletedDistance)}
              </p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Average Signs Per Hour</p>
              <p className={`${styles.statValue} ${styles.danger}`}>
                {statsLoading || totalCompletedHours === 0 ? '…' : (totalSigns / (totalCompletedHours / 60)).toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <p className={styles.welcome}>Showing analytics for {periodSummary}</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
          <KpiCard
            title="Routes Completed"
            value={statsLoading ? '…' : routesCompletedKpi}
            delta={statsLoading ? undefined : routesDelta}
            subtitle={`Period ${periodLabel}`}
            comparison={statsLoading ? undefined : `Prev: ${previousRoutesCompletedKpi}`}
          />
          <KpiCard
            title="Total Revenue"
            value={statsLoading ? '…' : formatCurrency(totalRevenueKpi)}
            delta={statsLoading ? undefined : revenueDelta}
            subtitle={`Period ${periodLabel}`}
            comparison={statsLoading ? undefined : `Prev: ${formatCurrency(previousRevenueKpi)}`}
          />
          <KpiCard
            title="Average Revenue / Route"
            value={statsLoading ? '…' : formatCurrency(avgRevenuePerRouteKpi)}
            subtitle={`Period ${periodLabel}`}
            comparison={statsLoading ? undefined : `Prev: ${formatCurrency(previousAvgRevenuePerRouteKpi)}`}
          />
          <KpiCard
            title="Total Distance"
            value={statsLoading ? '…' : `${totalDistanceKpi.toFixed(1)} km`}
            delta={statsLoading ? undefined : distanceDelta}
            subtitle={`Period ${periodLabel}`}
            comparison={statsLoading ? undefined : `Prev: ${previousDistanceKpi.toFixed(1)} km`}
          />
        </div>

      </div>
    </OperatorRoute>
  );
}
