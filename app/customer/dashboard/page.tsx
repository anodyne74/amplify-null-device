'use client';

import { useEffect, useMemo, useState } from 'react';
import React from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import type { Customer, Stop, Route } from '@/amplify/types';
import { getUserDisplayName, getUserEmail } from '@/lib/amplify-config';
import { parseAgentOptionsInput, stringifyAgentOptions } from '@/lib/customerDefaults';
import { getCustomer, getCustomerPortalContext, getUserSettings, updateCustomer } from '@/lib/queries';
import { listMyInvoices } from '@/lib/queries/ListMyInvoices';
import { listMyRoutes } from '@/lib/queries/ListMyRoutes';
import styles from '@/app/dashboard.module.css';
import PeriodSelector from '../../components/PeriodSelector';
import KpiCard from '../../components/KpiCard';
import {
  aggregateRouteData,
  getDateGroup,
  getPreviousDateGroup,
  type AnalyticsPeriod,
} from '@/lib/aggregateRouteData';

type CustomerInvoice = {
  totalAmount?: number | null;
  status?: string | null;
  invoiceDate?: string | null;
  createdAt?: string | null;
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

function getDeltaPercent(current: number, previous: number): number {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }

  return Math.round(((current - previous) / previous) * 100);
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

/**
 * Customer Dashboard
 * Shows overview of routes, invoices, and statistics
 */
export default function CustomerDashboard() {
  const { user } = useAuthenticator();
  const userEmail = user ? getUserEmail(user) : '';
  const fallbackDisplayName = user ? getUserDisplayName(user) ?? getUserEmail(user) ?? '' : '';
  const [displayName, setDisplayName] = useState(fallbackDisplayName);
  const [customerRole, setCustomerRole] = useState<'account_owner' | 'read_only'>('account_owner');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [standingInstructions, setStandingInstructions] = useState('');
  const [defaultNumberOfSigns, setDefaultNumberOfSigns] = useState('');
  const [defaultAgentName, setDefaultAgentName] = useState('');
  const [agentOptionsText, setAgentOptionsText] = useState('');
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
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

  const [selectedPeriod, setSelectedPeriod] = React.useState<'week' | 'month' | 'quarter' | 'year'>('week');

  const completedRoutesForAnalytics = useMemo(
    () => analyticsRoutes.filter((route) => route.status === 'completed'),
    [analyticsRoutes]
  );

  const groupedAnalytics = useMemo(
    () => aggregateRouteData(completedRoutesForAnalytics, analyticsInvoices, selectedPeriod as AnalyticsPeriod),
    [completedRoutesForAnalytics, analyticsInvoices, selectedPeriod]
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
          setCustomerId(context.customerId);
        }

        if (!context.customerId) {
          if (!cancelled) {
            setSettingsError('Could not resolve your customer account.');
          }
          return;
        }

        const customerResult = await getCustomer(context.customerId);
        if (cancelled || (customerResult.errors && customerResult.errors.length > 0)) {
          if (!cancelled) {
            const firstError = customerResult.errors?.[0] as { message?: string } | undefined;
            setSettingsError(firstError?.message ?? 'Could not load customer defaults.');
          }
          return;
        }

        const nextCustomer = customerResult.data as Customer | null;
        if (!nextCustomer) {
          return;
        }

        setCustomer(nextCustomer);
        setStandingInstructions(nextCustomer.standingInstructions ?? '');
        setDefaultNumberOfSigns(
          typeof nextCustomer.defaultNumberOfSigns === 'number' ? String(nextCustomer.defaultNumberOfSigns) : ''
        );
        setDefaultAgentName(nextCustomer.defaultAgentName ?? '');
        setAgentOptionsText(stringifyAgentOptions(nextCustomer.agentOptions));

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

  const handleSaveSettings = async () => {
    if (!user?.userId) {
      setSettingsError('User session is unavailable.');
      return;
    }

    if (customerRole !== 'account_owner') {
      setSettingsError('Only the account owner can edit these defaults.');
      return;
    }

    if (!customerId) {
      setSettingsError('Customer account could not be resolved.');
      return;
    }

    const parsedDefaultNumberOfSigns = defaultNumberOfSigns.trim()
      ? Number(defaultNumberOfSigns)
      : undefined;
    if (
      defaultNumberOfSigns.trim() &&
      (Number.isNaN(parsedDefaultNumberOfSigns) || parsedDefaultNumberOfSigns! < 0)
    ) {
      setSettingsError('Default number of signs must be 0 or greater.');
      return;
    }

    setSavingSettings(true);
    setSettingsError(null);
    setSettingsSuccess(null);

    const result = await updateCustomer(customerId, {
      standingInstructions,
      defaultNumberOfSigns: parsedDefaultNumberOfSigns,
      defaultAgentName,
      agentOptions: parseAgentOptionsInput(agentOptionsText),
    });

    if (result.errors && result.errors.length > 0) {
      const firstError = result.errors[0] as { message?: string } | undefined;
      setSettingsError(firstError?.message ?? 'Could not save standing instructions.');
      setSavingSettings(false);
      return;
    }

    if (customer?.id) {
      const refreshed = await getCustomer(customer.id);
      const nextCustomer = refreshed.data as Customer | null;
      if (nextCustomer) {
        setCustomer(nextCustomer);
        setStandingInstructions(nextCustomer.standingInstructions ?? '');
        setDefaultNumberOfSigns(
          typeof nextCustomer.defaultNumberOfSigns === 'number' ? String(nextCustomer.defaultNumberOfSigns) : ''
        );
        setDefaultAgentName(nextCustomer.defaultAgentName ?? '');
        setAgentOptionsText(stringifyAgentOptions(nextCustomer.agentOptions));
      }
    }

    setSettingsSuccess('Standing instructions updated.');
    setSavingSettings(false);
  };

  return (
    <div className={styles.page}>
      <div>
        <h1 className={styles.heading}>Customer Portal</h1>
        <p className={styles.welcome}>
          Welcome, {displayName || userEmail} · {customerRole === 'account_owner' ? 'Owner' : 'Reviewer'}
        </p>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Active Routes</p>
          <p className={`${styles.statValue} ${styles.cyan}`}>{statsLoading ? '…' : activeRoutes}</p>
        </div>
        {customerRole === 'account_owner' ? (
          <>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Pending Invoices</p>
              <p className={`${styles.statValue} ${styles.amber}`}>{statsLoading ? '…' : pendingInvoices}</p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Outstanding Balance</p>
              <p className={`${styles.statValue} ${styles.danger}`}>{statsLoading ? '…' : formatCurrency(outstandingAmount)}</p>
            </div>
          </>
        ) : (
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Access Level</p>
            <p className={`${styles.statValue} ${styles.green}`}>Read Only</p>
          </div>
        )}
      </div>

      <div className={styles.infoPanel}>
        <h3>Customer Totals</h3>
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Jobs Completed</p>
            <p className={`${styles.statValue} ${styles.green}`}>{statsLoading ? '…' : totalCompletedRoutes}</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Total Distance</p>
            <p className={`${styles.statValue} ${styles.amber}`}>
              {statsLoading ? '…' : `${totalDistance.toFixed(1)} km`}
            </p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Total Stops</p>
            <p className={`${styles.statValue} ${styles.cyan}`}>{statsLoading ? '…' : totalStops}</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Total Signs</p>
            <p className={`${styles.statValue} ${styles.danger}`}>{statsLoading ? '…' : totalSigns}</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Total Hours</p>
            <p className={`${styles.statValue} ${styles.green}`}>
              {statsLoading ? '…' : formatDuration(totalHours)}
            </p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Total Invoiced Amount</p>
            <p className={`${styles.statValue} ${styles.cyan}`}>
              {customerRole === 'account_owner'
                ? statsLoading
                  ? '…'
                  : formatCurrency(totalInvoicedAmount)
                : 'Restricted'}
            </p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Outstanding Amount</p>
            <p className={`${styles.statValue} ${styles.danger}`}>
              {customerRole === 'account_owner'
                ? statsLoading
                  ? '…'
                  : formatCurrency(outstandingAmount)
                : 'Restricted'}
            </p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Average Per Job</p>
            <p className={`${styles.statValue} ${styles.amber}`}>
              {customerRole === 'account_owner'
                ? statsLoading || totalCompletedRoutes === 0
                  ? '…'
                  : formatCurrency(totalInvoicedAmount / totalCompletedRoutes)
                : 'Restricted'}
            </p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Average Per Stop</p>
            <p className={`${styles.statValue} ${styles.cyan}`}>
              {customerRole === 'account_owner'
                ? statsLoading || totalStops === 0
                  ? '…'
                  : formatCurrency(totalInvoicedAmount / totalStops)
                : 'Restricted'}
            </p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Average Per Sign</p>
            <p className={`${styles.statValue} ${styles.green}`}>
              {customerRole === 'account_owner'
                ? statsLoading || totalSigns === 0
                  ? '…'
                  : formatCurrency(totalInvoicedAmount / totalSigns)
                : 'Restricted'}
            </p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Average Per Kilometer</p>
            <p className={`${styles.statValue} ${styles.amber}`}>
              {customerRole === 'account_owner'
                ? statsLoading || totalDistance === 0
                  ? '…'
                  : formatCurrency(totalInvoicedAmount / totalDistance)
                : 'Restricted'}
            </p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Average Signs Per Hour</p>
            <p className={`${styles.statValue} ${styles.danger}`}>
              {customerRole === 'account_owner'
                ? statsLoading || totalHours === 0
                  ? '…'
                  : (totalSigns / (totalHours / 60)).toFixed(2)
                : 'Restricted'}
            </p>
          </div>
        </div>
      </div>

      <div className={styles.infoPanel}>
        <h3>{customerRole === 'account_owner' ? 'Owner Capabilities' : 'Reviewer Capabilities'}</h3>
        <ul>
          <li>View your active routes in the Routes section</li>
          {customerRole === 'account_owner' ? (
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
      </div>

      <div className={styles.infoPanel}>
        <h3>Standing Instructions</h3>
        {customerRole === 'account_owner' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {settingsError && <p>{settingsError}</p>}
            {settingsSuccess && <p>{settingsSuccess}</p>}
            <textarea
              value={standingInstructions}
              onChange={(event) => setStandingInstructions(event.target.value)}
              placeholder="Instructions operators should see by default"
              disabled={savingSettings}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <input
                value={defaultNumberOfSigns}
                onChange={(event) => setDefaultNumberOfSigns(event.target.value)}
                type="number"
                min={0}
                placeholder="Default number of signs"
                disabled={savingSettings}
              />
              <input
                value={defaultAgentName}
                onChange={(event) => setDefaultAgentName(event.target.value)}
                placeholder="Default agent name"
                disabled={savingSettings}
              />
            </div>
            <textarea
              value={agentOptionsText}
              onChange={(event) => setAgentOptionsText(event.target.value)}
              placeholder="Agent options, one per line"
              disabled={savingSettings}
            />
            <p className={styles.welcome}>
              {customer?.defaultAgentInitials
                ? `Current default initials: ${customer.defaultAgentInitials}`
                : 'Initials are generated automatically from the default agent name.'}
            </p>
            <button type="button" onClick={() => void handleSaveSettings()} disabled={savingSettings || !customerId}>
              {savingSettings ? 'Saving...' : 'Save Standing Instructions'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <p className={styles.welcome}>Only the account owner can edit these defaults.</p>
            <p>{customer?.standingInstructions || 'No standing instructions configured.'}</p>
            <p className={styles.welcome}>
              Default signs: {typeof customer?.defaultNumberOfSigns === 'number' ? customer.defaultNumberOfSigns : '—'}
              {' · '}
              Default agent: {customer?.defaultAgentName || '—'}
            </p>
          </div>
        )}
      </div>

      <div style={{ marginTop: '1rem' }}>
        <p className={styles.welcome}>Showing analytics for {periodSummary}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
        <PeriodSelector selectedPeriod={selectedPeriod} onChange={setSelectedPeriod} />
        <div style={{ display: 'contents' }}>
          <KpiCard
            title="Routes Completed"
            value={statsLoading ? '…' : routesCompletedKpi}
            delta={statsLoading ? undefined : routesDelta}
            subtitle={`Period ${periodLabel}`}
            comparison={statsLoading ? undefined : `Prev: ${previousRoutesCompletedKpi}`}
          />
          <KpiCard
            title="Total Revenue"
            value={
              customerRole === 'account_owner'
                ? statsLoading
                  ? '…'
                  : formatCurrency(totalRevenueKpi)
                : 'Restricted'
            }
            delta={customerRole === 'account_owner' && !statsLoading ? revenueDelta : undefined}
            subtitle={`Period ${periodLabel}`}
            comparison={
              customerRole === 'account_owner' && !statsLoading
                ? `Prev: ${formatCurrency(previousRevenueKpi)}`
                : undefined
            }
          />
          <KpiCard
            title="Average Revenue / Route"
            value={
              customerRole === 'account_owner'
                ? statsLoading
                  ? '…'
                  : formatCurrency(avgRevenuePerRouteKpi)
                : 'Restricted'
            }
            subtitle={`Period ${periodLabel}`}
            comparison={
              customerRole === 'account_owner' && !statsLoading
                ? `Prev: ${formatCurrency(previousAvgRevenuePerRouteKpi)}`
                : undefined
            }
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
    </div>
  );
}
