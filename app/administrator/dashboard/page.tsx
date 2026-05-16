'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import { listAllRoutes } from '@/lib/queries/ListAllRoutes';
import { listInvoices } from '@/lib/queries';
import type { Route } from '@/amplify/types';
import OperatorRoute from '@/app/components/OperatorRoute';
import styles from '@/app/dashboard.module.css';

type Invoice = {
  id: string;
  totalAmount: number;
  status?: 'draft' | 'finalized' | 'sent' | 'paid' | null;
  emailSentAt?: string | null;
};

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

export default function AdminHomePage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customerCount, setCustomerCount] = useState<number | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [totalStops, setTotalStops] = useState(0);
  const [totalSigns, setTotalSigns] = useState(0);

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



  const completedRoutes = useMemo(() => routes.filter((r) => r.status === 'completed'), [routes]);
  const totalCompletedHours = useMemo(
    () =>
      completedRoutes.reduce(
        (sum, r) => sum + (typeof r.actualDurationMinutes === 'number' ? r.actualDurationMinutes : 0),
        0
      ),
    [completedRoutes]
  );
  const totalCompletedDistance = useMemo(() => {
    return completedRoutes.reduce(
      (sum, r) => sum + (typeof r.signsPlacedDistanceKm === 'number' ? r.signsPlacedDistanceKm : 0) +
                   (typeof r.signsPickedUpDistanceKm === 'number' ? r.signsPickedUpDistanceKm : 0),
      0
    );
  }, [completedRoutes]);
  const totalInvoicedAmount = useMemo(
    () => invoices.reduce((sum, inv) => sum + (typeof inv.totalAmount === 'number' ? inv.totalAmount : 0), 0),
    [invoices]
  );
  const totalOutstandingBalance = useMemo(
    () => invoices
      .filter((inv) => inv.status !== 'paid')
      .reduce((sum, inv) => sum + (typeof inv.totalAmount === 'number' ? inv.totalAmount : 0), 0),
    [invoices]
  );

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.page}>
        <div>
          <h1 className={styles.heading}>Administrator Portal</h1>
          <p className={styles.welcome}>Manage customers, invoices, users, and route operations. Send invoices via email directly to customers.</p>
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

        {/* Quick Actions Section */}
        <div className={styles.infoPanel}>
          <h3>Quick Actions</h3>
          <div className={styles.statsGrid}>
            <Link href="/administrator/routes" className={styles.statCard}>
              <p className={styles.statLabel}>View All Routes</p>
              <p className={`${styles.statValue} ${styles.cyan}`}>→</p>
            </Link>
            <Link href="/administrator/invoices" className={styles.statCard}>
              <p className={styles.statLabel}>Manage Invoices</p>
              <p className={`${styles.statValue} ${styles.green}`}>→</p>
            </Link>
            <Link href="/administrator/customers" className={styles.statCard}>
              <p className={styles.statLabel}>Manage Customers</p>
              <p className={`${styles.statValue} ${styles.amber}`}>→</p>
            </Link>
            <Link href="/administrator/users" className={styles.statCard}>
              <p className={styles.statLabel}>Manage Users</p>
              <p className={`${styles.statValue} ${styles.danger}`}>→</p>
            </Link>
          </div>
        </div>
      </div>
    </OperatorRoute>
  );
}
