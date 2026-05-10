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
  status?: 'draft' | 'finalized' | 'sent' | 'paid' | null;
  emailSentAt?: string | null;
};

export default function AdminHomePage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customerCount, setCustomerCount] = useState<number | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      setStatsLoading(true);
      try {
        const [routeResult, invoiceResult, customerResult] = await Promise.all([
          listAllRoutes({ limit: 200 }),
          listInvoices({ limit: 200 }),
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
      } catch { /* stats are best-effort */ }
      setStatsLoading(false);
    }
    void loadStats();
  }, []);

  const activeRoutes = useMemo(
    () => routes.filter((r) => r.status === 'signs_placed' || r.status === 'signs_picked_up'),
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

  const emailsSentToday = useMemo(() => {
    const today = new Date().toDateString();
    return invoices.filter(
      (inv) => inv.emailSentAt && new Date(inv.emailSentAt).toDateString() === today
    );
  }, [invoices]);

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
            <Link href="/administrator/routes" className={styles.statCard}>
              <p className={styles.statLabel}>All Routes</p>
              <p className={`${styles.statValue} ${styles.amber}`}>Open →</p>
            </Link>
          </div>

          {/* Planned Routes + Generate Invoices */}
          <div className={styles.cardColumn}>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Planned Routes</p>
              <p className={`${styles.statValue} ${styles.cyan}`}>
                {statsLoading ? '…' : plannedRoutes.length}
              </p>
            </div>
            <Link href="/administrator/invoices" className={styles.statCard}>
              <p className={styles.statLabel}>Generate Invoices</p>
              <p className={`${styles.statValue} ${styles.green}`}>Open →</p>
            </Link>
          </div>

          {/* Completed Today + Manage Users */}
          <div className={styles.cardColumn}>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Completed Today</p>
              <p className={`${styles.statValue} ${styles.amber}`}>
                {statsLoading ? '…' : completedToday.length}
              </p>
            </div>
            <Link href="/administrator/users" className={styles.statCard}>
              <p className={styles.statLabel}>Manage Users</p>
              <p className={`${styles.statValue} ${styles.danger}`}>Open →</p>
            </Link>
          </div>

          {/* Customers + Define Customers */}
          <div className={styles.cardColumn}>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Customers</p>
              <p className={`${styles.statValue} ${styles.cyan}`}>
                {statsLoading ? '…' : customerCount ?? '—'}
              </p>
            </div>
            <Link href="/administrator/customers" className={styles.statCard}>
              <p className={styles.statLabel}>Define Customers</p>
              <p className={`${styles.statValue} ${styles.cyan}`}>Open →</p>
            </Link>
          </div>

          {/* Unsent Invoices + Send Invoice */}
          <div className={styles.cardColumn}>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Unsent Invoices</p>
              <p className={`${styles.statValue} ${styles.danger}`}>
                {statsLoading ? '…' : unsentInvoices.length}
              </p>
            </div>
            <Link href="/administrator/invoices" className={styles.statCard}>
              <p className={styles.statLabel}>Send via SES</p>
              <p className={`${styles.statValue} ${styles.green}`}>Open →</p>
            </Link>
          </div>

          {/* Emails Sent Today + Invoice History */}
          <div className={styles.cardColumn}>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Emails Sent Today</p>
              <p className={`${styles.statValue} ${styles.green}`}>
                {statsLoading ? '…' : emailsSentToday.length}
              </p>
            </div>
            <Link href="/administrator/invoices" className={styles.statCard}>
              <p className={styles.statLabel}>Invoice History</p>
              <p className={`${styles.statValue} ${styles.cyan}`}>Open →</p>
            </Link>
          </div>
        </div>
      </div>
    </OperatorRoute>
  );
}
