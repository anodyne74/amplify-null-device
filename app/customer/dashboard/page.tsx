'use client';

import { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import type { Customer, Stop } from '@/amplify/types';
import { getUserDisplayName, getUserEmail } from '@/lib/amplify-config';
import { parseAgentOptionsInput, stringifyAgentOptions } from '@/lib/customerDefaults';
import { getCustomer, getCustomerPortalContext, getUserSettings, updateCustomer } from '@/lib/queries';
import { listMyInvoices } from '@/lib/queries/ListMyInvoices';
import { listMyRoutes } from '@/lib/queries/ListMyRoutes';
import styles from '@/app/dashboard.module.css';

function haversineDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function calculateTotalKilometers(stops: Stop[]) {
  const stopsByRoute = new Map<string, Stop[]>();

  stops.forEach((stop) => {
    if (!stop.routeId) return;
    const existing = stopsByRoute.get(stop.routeId) ?? [];
    existing.push(stop);
    stopsByRoute.set(stop.routeId, existing);
  });

  let total = 0;
  stopsByRoute.forEach((routeStops) => {
    const ordered = [...routeStops]
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
      .filter(
        (stop) => typeof stop.latitude === 'number' && typeof stop.longitude === 'number'
      )
      .map((stop) => ({ lat: stop.latitude as number, lng: stop.longitude as number }));

    for (let index = 1; index < ordered.length; index += 1) {
      total += haversineDistanceKm(ordered[index - 1], ordered[index]);
    }
  });

  return Number(total.toFixed(2));
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
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
  const [totalKilometers, setTotalKilometers] = useState(0);
  const [totalInvoicedAmount, setTotalInvoicedAmount] = useState(0);

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
        const routes = (routesResult.data as Array<{ status?: string | null }>) ?? [];

        if (!cancelled) {
          setActiveRoutes(
            routes.filter((route) => route.status === 'signs_placed' || route.status === 'signs_picked_up').length
          );
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
          setTotalKilometers(calculateTotalKilometers(customerStops));
        }

        if (context.role === 'account_owner') {
          const invoiceResult = await listMyInvoices({
            customerId: context.customerId,
            userSub: user.userId,
            limit: 500,
          });
          const invoiceItems =
            (invoiceResult.data as Array<{ totalAmount?: number | null; status?: string | null }>) ?? [];

          if (!cancelled) {
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
            <p className={styles.statLabel}>Total Signs</p>
            <p className={`${styles.statValue} ${styles.green}`}>{statsLoading ? '…' : totalSigns}</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Total Stops</p>
            <p className={`${styles.statValue} ${styles.cyan}`}>{statsLoading ? '…' : totalStops}</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Total Kilometers</p>
            <p className={`${styles.statValue} ${styles.amber}`}>
              {statsLoading ? '…' : `${totalKilometers.toFixed(2)} km`}
            </p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Total Invoiced Amount</p>
            <p className={`${styles.statValue} ${styles.danger}`}>
              {customerRole === 'account_owner'
                ? statsLoading
                  ? '…'
                  : formatCurrency(totalInvoicedAmount)
                : 'Restricted'}
            </p>
          </div>
        </div>
      </div>

      <div className={styles.infoPanel}>
        <h3>Outstanding Amount</h3>
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Current Outstanding</p>
            <p className={`${styles.statValue} ${styles.danger}`}>
              {customerRole === 'account_owner'
                ? statsLoading
                  ? '…'
                  : formatCurrency(outstandingAmount)
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
    </div>
  );
}
