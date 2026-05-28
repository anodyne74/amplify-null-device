'use client';

import { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useThemeMode } from '@/app/components/AmplifyThemeProvider';
import { getUserDisplayName } from '@/lib/amplify-config';
import {
  getUserSettings,
  upsertUserSettings,
  type MapThemeSetting,
  type ThemeModeSetting,
} from '@/lib/queries';
import { DEFAULT_COMPANY_BILLING_DETAILS } from '@/lib/companyBilling';
import { MAP_THEMES } from '@/lib/mapThemes';
import styles from './UserSettingsPage.module.css';

type RoleVariant = 'administrator' | 'operator' | 'customer';

interface UserSettingsPageProps {
  title: string;
  roleVariant: RoleVariant;
}

export default function UserSettingsPage({ title, roleVariant }: UserSettingsPageProps) {
  const { user } = useAuthenticator();
  const { mode, setMode } = useThemeMode();
  const fallbackDisplayName = user ? getUserDisplayName(user) ?? '' : '';

  const [name, setName] = useState('');
  const [defaultTheme, setDefaultTheme] = useState<ThemeModeSetting>('system');
  const [mapTheme, setMapTheme] = useState<MapThemeSetting>('light');
  const [billingCompanyName, setBillingCompanyName] = useState(DEFAULT_COMPANY_BILLING_DETAILS.companyName);
  const [billingAbn, setBillingAbn] = useState(DEFAULT_COMPANY_BILLING_DETAILS.abn);
  const [billingPhone, setBillingPhone] = useState(DEFAULT_COMPANY_BILLING_DETAILS.phone);
  const [billingCompanyAddress, setBillingCompanyAddress] = useState(DEFAULT_COMPANY_BILLING_DETAILS.companyAddress);
  const [billingPaymentAccountName, setBillingPaymentAccountName] = useState(DEFAULT_COMPANY_BILLING_DETAILS.paymentAccountName);
  const [billingBsb, setBillingBsb] = useState(DEFAULT_COMPANY_BILLING_DETAILS.bsb);
  const [billingAccountNumber, setBillingAccountNumber] = useState(DEFAULT_COMPANY_BILLING_DETAILS.accountNumber);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.userId) return;
    let cancelled = false;

    setName(fallbackDisplayName);

    void getUserSettings(user.userId)
      .then((result) => {
        if (cancelled) return;

        if (!result.data) {
          setName(fallbackDisplayName);
          return;
        }

        setName(result.data.name?.trim() || fallbackDisplayName);
        setDefaultTheme((result.data.defaultTheme as ThemeModeSetting | null) || 'system');
        setMapTheme((result.data.mapTheme as MapThemeSetting | null) || 'light');

        setBillingCompanyName(result.data.billingCompanyName?.trim() || DEFAULT_COMPANY_BILLING_DETAILS.companyName);
        setBillingAbn(result.data.billingAbn?.trim() || DEFAULT_COMPANY_BILLING_DETAILS.abn);
        setBillingPhone(result.data.billingPhone?.trim() || DEFAULT_COMPANY_BILLING_DETAILS.phone);
        setBillingCompanyAddress(result.data.billingCompanyAddress?.trim() || DEFAULT_COMPANY_BILLING_DETAILS.companyAddress);
        setBillingPaymentAccountName(result.data.billingPaymentAccountName?.trim() || DEFAULT_COMPANY_BILLING_DETAILS.paymentAccountName);
        setBillingBsb(result.data.billingBsb?.trim() || DEFAULT_COMPANY_BILLING_DETAILS.bsb);
        setBillingAccountNumber(result.data.billingAccountNumber?.trim() || DEFAULT_COMPANY_BILLING_DETAILS.accountNumber);
      })
      .catch(() => {
        // Non-blocking: defaults are already set in local state.
      });

    return () => {
      cancelled = true;
    };
  }, [fallbackDisplayName, user?.userId]);

  const handleSave = async () => {
    if (!user?.userId) {
      setMessage('Unable to save settings. Please sign in again.');
      return;
    }

    setPending(true);
    setMessage(null);

    const result = await upsertUserSettings(user.userId, {
      name: name.trim() || undefined,
      defaultTheme,
      mapTheme,
      billingCompanyName: roleVariant === 'administrator' ? billingCompanyName.trim() || undefined : undefined,
      billingAbn: roleVariant === 'administrator' ? billingAbn.trim() || undefined : undefined,
      billingPhone: roleVariant === 'administrator' ? billingPhone.trim() || undefined : undefined,
      billingCompanyAddress: roleVariant === 'administrator' ? billingCompanyAddress.trim() || undefined : undefined,
      billingPaymentAccountName: roleVariant === 'administrator' ? billingPaymentAccountName.trim() || undefined : undefined,
      billingBsb: roleVariant === 'administrator' ? billingBsb.trim() || undefined : undefined,
      billingAccountNumber: roleVariant === 'administrator' ? billingAccountNumber.trim() || undefined : undefined,
    });

    if (result.errors && result.errors.length > 0) {
      setMessage('Failed to save settings. Please try again.');
      setPending(false);
      return;
    }

    setMode(defaultTheme);
    setMessage('Settings saved.');
    setPending(false);
  };

  const roleLabel = roleVariant === 'administrator' ? 'Administrator' : roleVariant === 'operator' ? 'Operator' : 'Customer';

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>{title}</h1>
      <p className={styles.subtext}>{roleLabel} profile and preferences.</p>

      <div className={styles.panel}>
        <div className={styles.grid}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="settings-name">
              Name
            </label>
            <input
              id="settings-name"
              className={styles.input}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your display name"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="settings-theme">
              Default Theme
            </label>
            <select
              id="settings-theme"
              className={styles.select}
              value={defaultTheme}
              onChange={(event) => setDefaultTheme(event.target.value as ThemeModeSetting)}
            >
              <option value="system">System</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="settings-map-theme">
              Map Theme
            </label>
            <select
              id="settings-map-theme"
              className={styles.select}
              value={mapTheme}
              onChange={(event) => setMapTheme(event.target.value as MapThemeSetting)}
            >
              {MAP_THEMES.map((theme) => (
                <option key={theme.key} value={theme.key}>
                  {theme.label}
                </option>
              ))}
            </select>
          </div>

          {roleVariant === 'administrator' && (
            <>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="settings-billing-company-name">
                  Billing Company Name
                </label>
                <input
                  id="settings-billing-company-name"
                  className={styles.input}
                  value={billingCompanyName}
                  onChange={(event) => setBillingCompanyName(event.target.value)}
                  placeholder="Company name"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="settings-billing-abn">
                  Billing ABN
                </label>
                <input
                  id="settings-billing-abn"
                  className={styles.input}
                  value={billingAbn}
                  onChange={(event) => setBillingAbn(event.target.value)}
                  placeholder="ABN"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="settings-billing-phone">
                  Billing Phone
                </label>
                <input
                  id="settings-billing-phone"
                  className={styles.input}
                  value={billingPhone}
                  onChange={(event) => setBillingPhone(event.target.value)}
                  placeholder="Phone"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="settings-billing-company-address">
                  Billing Company Address
                </label>
                <input
                  id="settings-billing-company-address"
                  className={styles.input}
                  value={billingCompanyAddress}
                  onChange={(event) => setBillingCompanyAddress(event.target.value)}
                  placeholder="Address"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="settings-billing-payment-account-name">
                  Payment Account Name
                </label>
                <input
                  id="settings-billing-payment-account-name"
                  className={styles.input}
                  value={billingPaymentAccountName}
                  onChange={(event) => setBillingPaymentAccountName(event.target.value)}
                  placeholder="Account name"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="settings-billing-bsb">
                  Payment BSB
                </label>
                <input
                  id="settings-billing-bsb"
                  className={styles.input}
                  value={billingBsb}
                  onChange={(event) => setBillingBsb(event.target.value)}
                  placeholder="BSB"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="settings-billing-account-number">
                  Payment Account Number
                </label>
                <input
                  id="settings-billing-account-number"
                  className={styles.input}
                  value={billingAccountNumber}
                  onChange={(event) => setBillingAccountNumber(event.target.value)}
                  placeholder="Account number"
                />
              </div>
            </>
          )}
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.button} disabled={pending} onClick={() => void handleSave()}>
            {pending ? 'Saving...' : 'Save Settings'}
          </button>
          {message && <p className={styles.message}>{message}</p>}
        </div>

        <p className={styles.subtext}>
          Current theme in app: {mode}
        </p>
      </div>
    </div>
  );
}
