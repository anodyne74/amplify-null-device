'use client';

import { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import type { Customer } from '@/amplify/types';
import { getUserEmail } from '@/lib/amplify-config';
import { parseAgentOptionsInput, stringifyAgentOptions } from '@/lib/customerDefaults';
import { getCustomer, getCustomerPortalContext, updateCustomerDefaultsForUser } from '@/lib/queries';
import styles from '@/app/dashboard.module.css';

/**
 * Customer Dashboard
 * Shows overview of routes, invoices, and statistics
 */
export default function CustomerDashboard() {
  const { user } = useAuthenticator();
  const userEmail = user ? getUserEmail(user) : '';
  const [customerRole, setCustomerRole] = useState<'account_owner' | 'read_only'>('account_owner');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [standingInstructions, setStandingInstructions] = useState('');
  const [defaultNumberOfSigns, setDefaultNumberOfSigns] = useState('');
  const [defaultAgentName, setDefaultAgentName] = useState('');
  const [agentOptionsText, setAgentOptionsText] = useState('');
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (!user?.userId) return;
    let cancelled = false;

    void getCustomerPortalContext(user.userId)
      .then(async (context) => {
        if (!cancelled) {
          setCustomerRole(context.role);
        }

        const customerResult = await getCustomer(context.customerId);
        if (cancelled || (customerResult.errors && customerResult.errors.length > 0)) {
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
      })
      .catch(() => {
        if (!cancelled) {
          setCustomerRole('account_owner');
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

    const result = await updateCustomerDefaultsForUser(user.userId, {
      standingInstructions,
      defaultNumberOfSigns: parsedDefaultNumberOfSigns,
      defaultAgentName,
      agentOptions: parseAgentOptionsInput(agentOptionsText),
    });

    if (result.errors && result.errors.length > 0) {
      setSettingsError('Could not save standing instructions.');
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
        <h1 className={styles.heading}>Dashboard</h1>
        <p className={styles.welcome}>
          Welcome, {userEmail} · {customerRole === 'account_owner' ? 'Owner' : 'Reviewer'}
        </p>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Active Routes</p>
          <p className={`${styles.statValue} ${styles.cyan}`}>0</p>
        </div>
        {customerRole === 'account_owner' ? (
          <>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Pending Invoices</p>
              <p className={`${styles.statValue} ${styles.amber}`}>0</p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Outstanding Balance</p>
              <p className={`${styles.statValue} ${styles.danger}`}>$0</p>
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
            <button type="button" onClick={() => void handleSaveSettings()} disabled={savingSettings}>
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
