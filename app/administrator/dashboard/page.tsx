'use client';

import { useEffect, useMemo, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import { listAllRoutes } from '@/lib/queries/ListAllRoutes';
import { listInvoices } from '@/lib/queries';
import type { Route } from '@/amplify/types';
import OperatorRoute from '@/app/components/OperatorRoute';
import styles from '@/app/dashboard.module.css';
import MetricsVisualization, { type MetricsPeriod } from '../../components/MetricsVisualization';
import { aggregateRouteData } from '@/lib/aggregateRouteData';

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

export default function AdminHomePage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<MetricsPeriod>('month');
  const [selectedCustomerId, setSelectedCustomerId] = useState('all');

  useEffect(() => {
    async function loadStats() {
      setStatsLoading(true);
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

        const [routeResult, invoiceResult, customerResult] = await Promise.all([
          fetchAllRoutes(),
          fetchAllInvoices(),
          fetchAllCustomers(),
        ]);
        if (!routeResult.errors || routeResult.errors.length === 0) {
          setRoutes((routeResult.data as Route[]) || []);
        }
        if (!invoiceResult.errors || invoiceResult.errors.length === 0) {
          setInvoices((invoiceResult.data as Invoice[]) || []);
        }
        if (!customerResult.errors || customerResult.errors.length === 0) {
          setCustomers(customerResult.data ?? []);
        }
      } catch { /* stats are best-effort */ }
      setStatsLoading(false);
    }
    void loadStats();
  }, []);

  const scopedRoutes = useMemo(
    () => selectedCustomerId === 'all'
      ? routes
      : routes.filter((route) => route.customerId === selectedCustomerId),
    [routes, selectedCustomerId]
  );

  const scopedInvoices = useMemo(
    () => selectedCustomerId === 'all'
      ? invoices
      : invoices.filter((invoice) => invoice.customerId === selectedCustomerId),
    [invoices, selectedCustomerId]
  );

  const selectedCustomerName = useMemo(() => {
    if (selectedCustomerId === 'all') return 'All customers';
    return customers.find((customer) => customer.id === selectedCustomerId)?.name || 'Selected customer';
  }, [customers, selectedCustomerId]);

  const activeRoutes = useMemo(
    () => scopedRoutes.filter((r) => r.status === 'in_progress' || r.status === 'signs_placed' || r.status === 'signs_picked_up'),
    [scopedRoutes]
  );
  const plannedRoutes = useMemo(() => scopedRoutes.filter((r) => r.status === 'planned'), [scopedRoutes]);
  const completedToday = useMemo(() => {
    const today = new Date().toDateString();
    return scopedRoutes.filter(
      (r) => r.status === 'completed' && r.actualEndTime && new Date(r.actualEndTime).toDateString() === today
    );
  }, [scopedRoutes]);

  const unsentInvoices = useMemo(
    () => scopedInvoices.filter((inv) => inv.status !== 'sent' && inv.status !== 'paid'),
    [scopedInvoices]
  );

  const completedRoutesForAnalytics = useMemo(
    () => scopedRoutes.filter((route) => route.status === 'completed'),
    [scopedRoutes]
  );

  const groupedAnalytics = useMemo(
    () => aggregateRouteData(completedRoutesForAnalytics, scopedInvoices, selectedPeriod),
    [completedRoutesForAnalytics, scopedInvoices, selectedPeriod]
  );

  const completedRoutes = useMemo(
    () => scopedRoutes.filter((route) => route.status === 'completed'),
    [scopedRoutes]
  );
  const scopedCustomerCount = selectedCustomerId === 'all' ? customers.length : selectedCustomerId ? 1 : 0;

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.page}>
        <div className={styles.pageHeaderStack}>
          <h1 className={styles.heading}>Administrator Portal</h1>
          <p className={styles.welcome}>Manage customers, invoices, users, and route operations. Send invoices via email directly to customers.</p>
        </div>

        <div className={styles.pageToolbar}>
          <label className={styles.scopeField} htmlFor="admin-dashboard-scope">
            <span>Dashboard scope</span>
            <select
              id="admin-dashboard-scope"
              value={selectedCustomerId}
              onChange={(event) => setSelectedCustomerId(event.target.value)}
            >
              <option value="all">All customers</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name || customer.id}
                </option>
              ))}
            </select>
          </label>
        </div>

        <MetricsVisualization
          data={groupedAnalytics}
          period={selectedPeriod}
          onPeriodChange={setSelectedPeriod}
          loading={statsLoading}
          canShowFinancials
          scopeLabel={selectedCustomerName}
        />

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
                {statsLoading ? '…' : scopedRoutes.length}
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
                {statsLoading ? '…' : scopedInvoices.length}
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
                {statsLoading ? '…' : scopedCustomerCount}
              </p>
            </div>
          </div>

          {/* Unsent Invoices */}
          <div className={styles.cardColumn}>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Unsent Invoices</p>
              <p className={`${styles.statValue} ${styles.danger}`}>
                {statsLoading ? '…' : unsentInvoices.length}
              </p>
            </div>
          </div>
        </div>

      </div>
    </OperatorRoute>
  );
}
