'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import type { Customer, Stop, Route } from '@/amplify/types';
import { getUserDisplayName } from '@/lib/amplify-config';
import { getCustomer, getCustomerPortalContext, getUserSettings } from '@/lib/queries';
import { listMyInvoices } from '@/lib/queries/ListMyInvoices';
import { listMyRoutes } from '@/lib/queries/ListMyRoutes';
import { formatCurrency, formatDuration } from '@/lib/dashboardAnalytics';
import { getRouteStatusPresentation } from '@/lib/routeStatusHelpers';
import PageHeader from '@/app/customer/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { StatTile } from '@/app/components/ui/data/StatTile';
import MetricsVisualization, { type MetricsPeriod } from '../../components/MetricsVisualization';
import { aggregateRouteData } from '@/lib/aggregateRouteData';
import styles from './page.module.css';

type CustomerInvoice = {
  totalAmount?: number | null;
  status?: string | null;
  invoiceDate?: string | null;
  createdAt?: string | null;
};

/**
 * Customer Dashboard
 * Shows overview of routes, invoices, and statistics
 */
export default function CustomerDashboard() {
  const { user } = useAuthenticator();
  const fallbackDisplayName = user ? getUserDisplayName(user) ?? '' : '';
  const [displayName, setDisplayName] = useState(fallbackDisplayName);
  const [customerRole, setCustomerRole] = useState<'account_owner' | 'read_only'>('account_owner');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerLoadError, setCustomerLoadError] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [activeRoutes, setActiveRoutes] = useState(0);
  const [pendingInvoices, setPendingInvoices] = useState(0);
  const [outstandingAmount, setOutstandingAmount] = useState(0);
  const [totalStops, setTotalStops] = useState(0);
  const [totalSigns, setTotalSigns] = useState(0);

  const [totalInvoicedAmount, setTotalInvoicedAmount] = useState(0);
  const [totalCompletedRoutes, setTotalCompletedRoutes] = useState(0);
  const [totalHours, setTotalHours] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const [analyticsRoutes, setAnalyticsRoutes] = useState<Route[]>([]);
  const [analyticsInvoices, setAnalyticsInvoices] = useState<CustomerInvoice[]>([]);

  const [selectedPeriod, setSelectedPeriod] = useState<MetricsPeriod>('month');

  const completedRoutesForAnalytics = useMemo(
    () => analyticsRoutes.filter((route) => route.status === 'completed'),
    [analyticsRoutes]
  );

  const groupedAnalytics = useMemo(
    () => aggregateRouteData(completedRoutesForAnalytics, analyticsInvoices, selectedPeriod),
    [completedRoutesForAnalytics, analyticsInvoices, selectedPeriod]
  );

  useEffect(() => {
    setDisplayName(fallbackDisplayName);
  }, [fallbackDisplayName]);

  useEffect(() => {
    if (!user?.userId) return;
    if (typeof getUserSettings !== 'function') return;
    let cancelled = false;

    void getUserSettings(user.userId)
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
  }, [fallbackDisplayName, user?.userId]);

  useEffect(() => {
    if (!user?.userId) return;
    let cancelled = false;

    void getCustomerPortalContext(user.userId)
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

        setCustomer(nextCustomer);

        setStatsLoading(true);
        const routesResult = await listMyRoutes({ customerId: context.customerId, limit: 500 });
        const routes = (routesResult.data as Route[]) ?? [];
        if (!cancelled) {
          setAnalyticsRoutes(routes);
        }

        if (!cancelled) {
          setActiveRoutes(
            routes.filter((route) => route.status === 'in_progress' || route.status === 'signs_placed' || route.status === 'signs_picked_up').length
          );
          const completed = routes.filter((r) => r.status === 'completed');
          setTotalCompletedRoutes(completed.length);
          const totalMinutes = completed.reduce((sum, r) => sum + (typeof r.actualDurationMinutes === 'number' ? r.actualDurationMinutes : 0), 0);
          setTotalHours(totalMinutes);
          const totalDist = completed.reduce(
            (sum, r) => sum + (typeof r.signsPlacedDistanceKm === 'number' ? r.signsPlacedDistanceKm : 0) +
                         (typeof r.signsPickedUpDistanceKm === 'number' ? r.signsPickedUpDistanceKm : 0),
            0
          );
          setTotalDistance(totalDist);
        }

        const client = generateClient<Schema>();
        const stopResult = await client.models.Stop.list({
          filter: { customerId: { eq: context.customerId } },
          limit: 1000,
        });
        const customerStops = ((stopResult.data as unknown as Stop[]) ?? []).filter(Boolean);

        if (!cancelled) {
          setTotalStops(customerStops.length);
          setTotalSigns(
            customerStops.reduce(
              (sum, stop) => sum + (typeof stop.numberOfSigns === 'number' ? stop.numberOfSigns : 0),
              0
            )
          );
        }

        if (context.role === 'account_owner') {
          const invoiceResult = await listMyInvoices({
            customerId: context.customerId,
            userSub: user.userId,
            limit: 500,
          });
          const invoiceItems = (invoiceResult.data as CustomerInvoice[]) ?? [];

          if (!cancelled) {
            setAnalyticsInvoices(invoiceItems);
            const totalInvoiced = invoiceItems.reduce(
              (sum, invoice) => sum + (typeof invoice.totalAmount === 'number' ? invoice.totalAmount : 0),
              0
            );
            const unpaidInvoices = invoiceItems.filter((invoice) => invoice.status !== 'paid');
            const outstanding = unpaidInvoices.reduce(
              (sum, invoice) => sum + (typeof invoice.totalAmount === 'number' ? invoice.totalAmount : 0),
              0
            );

            setPendingInvoices(unpaidInvoices.length);
            setOutstandingAmount(Number(outstanding.toFixed(2)));
            setTotalInvoicedAmount(Number(totalInvoiced.toFixed(2)));
          }
        } else if (!cancelled) {
          setPendingInvoices(0);
          setOutstandingAmount(0);
          setTotalInvoicedAmount(0);
          setAnalyticsInvoices([]);
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
  }, [user?.userId]);

  const isAccountOwner = customerRole === 'account_owner';
  const averageSignsPerHour = totalHours > 0 ? (totalSigns / (totalHours / 60)).toFixed(2) : '…';
  const trackerRoutes = useMemo(
    () =>
      [...analyticsRoutes]
        .sort((a, b) => {
          const statusPriority = (status?: string | null) => {
            if (status === 'in_progress') return 0;
            if (status === 'signs_placed' || status === 'signs_picked_up') return 1;
            if (status === 'planned') return 2;
            if (status === 'completed') return 3;
            return 4;
          };
          const priorityDelta = statusPriority(a.status) - statusPriority(b.status);
          if (priorityDelta !== 0) return priorityDelta;
          return String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
        })
        .slice(0, 4),
    [analyticsRoutes]
  );

  return (
    <div className={styles.page}>
      <PageHeader
        title="Dashboard"
        subtitle={`Welcome,${displayName ? ` ${displayName}` : ''} · ${isAccountOwner ? 'Owner' : 'Reviewer'}`}
      />

      {customerLoadError && <p className="nd-badge nd-badge--danger">{customerLoadError}</p>}

      <div className={styles.statsGrid}>
        <StatTile label="Active routes" value={statsLoading ? '…' : activeRoutes} icon="route" />
        {isAccountOwner ? (
          <>
            <StatTile label="Pending invoices" value={statsLoading ? '…' : pendingInvoices} icon="receipt" />
            <StatTile
              label="Outstanding balance"
              value={statsLoading ? '…' : formatCurrency(outstandingAmount)}
              icon="triangle-alert"
            />
          </>
        ) : (
          <StatTile label="Route stops" value={statsLoading ? '…' : totalStops} icon="map-pin" />
        )}
      </div>

      {!isAccountOwner && (
        <Card title="Route Tracker">
          {trackerRoutes.length === 0 ? (
            <p className={styles.mutedText}>No routes are available for review.</p>
          ) : (
            <div className={styles.trackerList}>
              {trackerRoutes.map((route) => {
                const routeLabel = route.routeCode || route.id.slice(0, 8);
                const { label: statusLabel } = getRouteStatusPresentation(route.status);

                return (
                  <Link
                    key={route.id}
                    href={`/customer/routes/${route.id}`}
                    className={styles.trackerCard}
                    aria-label={`Review route ${routeLabel}`}
                  >
                    <div className={styles.trackerTopRow}>
                      <strong>Route {routeLabel}</strong>
                      <span className="nd-badge nd-badge--sm nd-badge--info">{statusLabel}</span>
                    </div>
                    <div className={styles.trackerMeta}>
                      {route.createdAt
                        ? new Date(route.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : 'Date unavailable'}
                    </div>
                    <div className={styles.trackerAction}>Review route {routeLabel}</div>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      )}

      <Card title="Customer Totals">
        <div className={styles.ndStatGrid}>
          <div className="nd-stat">
            <span className="nd-stat__label">Jobs completed</span>
            <span className="nd-stat__value">{statsLoading ? '…' : totalCompletedRoutes}</span>
          </div>
          <div className="nd-stat">
            <span className="nd-stat__label">Total distance</span>
            <span className="nd-stat__value">{statsLoading ? '…' : `${totalDistance.toFixed(1)} km`}</span>
          </div>
          <div className="nd-stat">
            <span className="nd-stat__label">Total stops</span>
            <span className="nd-stat__value">{statsLoading ? '…' : totalStops}</span>
          </div>
          <div className="nd-stat">
            <span className="nd-stat__label">Total signs</span>
            <span className="nd-stat__value">{statsLoading ? '…' : totalSigns}</span>
          </div>
          <div className="nd-stat">
            <span className="nd-stat__label">Total hours</span>
            <span className="nd-stat__value">{statsLoading ? '…' : formatDuration(totalHours)}</span>
          </div>
          <div className="nd-stat">
            <span className="nd-stat__label">Average signs per hour</span>
            <span className="nd-stat__value">{statsLoading ? '…' : averageSignsPerHour}</span>
          </div>
          {isAccountOwner && (
            <>
              <div className="nd-stat">
                <span className="nd-stat__label">Total invoiced amount</span>
                <span className="nd-stat__value">{statsLoading ? '…' : formatCurrency(totalInvoicedAmount)}</span>
              </div>
              <div className="nd-stat">
                <span className="nd-stat__label">Outstanding amount</span>
                <span className="nd-stat__value">{statsLoading ? '…' : formatCurrency(outstandingAmount)}</span>
              </div>
              <div className="nd-stat">
                <span className="nd-stat__label">Average per job</span>
                <span className="nd-stat__value">
                  {statsLoading || totalCompletedRoutes === 0 ? '…' : formatCurrency(totalInvoicedAmount / totalCompletedRoutes)}
                </span>
              </div>
              <div className="nd-stat">
                <span className="nd-stat__label">Average per stop</span>
                <span className="nd-stat__value">
                  {statsLoading || totalStops === 0 ? '…' : formatCurrency(totalInvoicedAmount / totalStops)}
                </span>
              </div>
              <div className="nd-stat">
                <span className="nd-stat__label">Average per sign</span>
                <span className="nd-stat__value">
                  {statsLoading || totalSigns === 0 ? '…' : formatCurrency(totalInvoicedAmount / totalSigns)}
                </span>
              </div>
              <div className="nd-stat">
                <span className="nd-stat__label">Average per kilometer</span>
                <span className="nd-stat__value">
                  {statsLoading || totalDistance === 0 ? '…' : formatCurrency(totalInvoicedAmount / totalDistance)}
                </span>
              </div>
            </>
          )}
        </div>
      </Card>

      <Card title={isAccountOwner ? 'Owner Capabilities' : 'Reviewer Capabilities'}>
        <ul className={styles.capabilitiesList}>
          <li>View your active routes in the Routes section</li>
          {isAccountOwner ? (
            <>
              <li>Download invoices from the Invoices section</li>
              <li>Check your statistics and billing info on the Dashboard</li>
            </>
          ) : (
            <>
              <li>Review planned and completed route progress</li>
              <li>Invoice access is restricted to the account owner</li>
            </>
          )}
        </ul>
      </Card>

      <MetricsVisualization
        data={groupedAnalytics}
        period={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
        loading={statsLoading}
        canShowFinancials={isAccountOwner}
        scopeLabel={customer?.name ?? 'Customer routes'}
      />
    </div>
  );
}
