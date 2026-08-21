'use client';

import { useEffect, useMemo, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import { listAllRoutes } from '@/lib/queries/ListAllRoutes';
import { listInvoices } from '@/lib/queries';
import type { Route } from '@/amplify/types';
import OperatorRoute from '@/app/components/OperatorRoute';
import PageHeader from '@/app/administrator/components/PageHeader';
import { Field } from '@/app/components/ui/forms/Field';
import { Select } from '@/app/components/ui/forms/Select';
import { StatTile } from '@/app/components/ui/data/StatTile';
import MetricsVisualization, { type MetricsPeriod } from '../../components/MetricsVisualization';
import { aggregateRouteData } from '@/lib/aggregateRouteData';
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
        <PageHeader
          title="Administrator Portal"
          subtitle="Manage customers, invoices, users, and route operations. Send invoices via email directly to customers."
        />

        <Field label="Dashboard scope" htmlFor="admin-dashboard-scope" className={styles.filterRow}>
          <Select
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
          </Select>
        </Field>

        <MetricsVisualization
          data={groupedAnalytics}
          period={selectedPeriod}
          onPeriodChange={setSelectedPeriod}
          loading={statsLoading}
          canShowFinancials
          scopeLabel={selectedCustomerName}
        />

        <div className={styles.statsGrid}>
          <StatTile label="Active Routes" value={statsLoading ? '…' : activeRoutes.length} icon="route" />
          <StatTile label="Total Routes" value={statsLoading ? '…' : scopedRoutes.length} icon="route" />
          <StatTile label="Planned Routes" value={statsLoading ? '…' : plannedRoutes.length} icon="clipboard-list" />
          <StatTile label="Total Invoices" value={statsLoading ? '…' : scopedInvoices.length} icon="file-text" />
          <StatTile label="Completed Today" value={statsLoading ? '…' : completedToday.length} icon="timer" />
          <StatTile label="Completed Routes" value={statsLoading ? '…' : completedRoutes.length} icon="route" />
          <StatTile label="Customers" value={statsLoading ? '…' : scopedCustomerCount} icon="users" />
          <StatTile label="Unsent Invoices" value={statsLoading ? '…' : unsentInvoices.length} icon="file-text" />
        </div>
      </div>
    </OperatorRoute>
  );
}
