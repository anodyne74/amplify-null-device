'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useThemeMode } from '@/app/components/AmplifyThemeProvider';
import { getUserDisplayName } from '@/lib/amplify-config';
import {
  getCustomer,
  getCustomerPortalContext,
  getUserSettings,
  upsertUserSettings,
  type MapThemeSetting,
  type ThemeModeSetting,
} from '@/lib/queries';
import { DEFAULT_COMPANY_BILLING_DETAILS } from '@/lib/companyBilling';
import { MAP_THEMES } from '@/lib/mapThemes';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Select } from '@/app/components/ui/forms/Select';
import { Switch } from '@/app/components/ui/forms/Switch';
import { Tabs } from '@/app/components/ui/navigation/Tabs';
import styles from './UserSettingsPage.module.css';

type RoleVariant = 'administrator' | 'operator' | 'customer';
type SettingsTab = 'user' | 'administrator' | 'customer';

type CustomerSettingsDetails = {
  name?: string | null;
  companyName?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  standingInstructions?: string | null;
};

interface UserSettingsPageProps {
  title: string;
  roleVariant: RoleVariant;
}

export default function UserSettingsPage({ title, roleVariant }: UserSettingsPageProps) {
  const { user } = useAuthenticator();
  const { mode, setMode } = useThemeMode();
  const fallbackDisplayName = user ? getUserDisplayName(user) ?? '' : '';

  const [name, setName] = useState('');
  const [defaultTheme, setDefaultTheme] = useState<ThemeModeSetting>('dark');
  const [mapTheme, setMapTheme] = useState<MapThemeSetting>('light');
  const [billingCompanyName, setBillingCompanyName] = useState(DEFAULT_COMPANY_BILLING_DETAILS.companyName);
  const [billingAbn, setBillingAbn] = useState(DEFAULT_COMPANY_BILLING_DETAILS.abn);
  const [billingPhone, setBillingPhone] = useState(DEFAULT_COMPANY_BILLING_DETAILS.phone);
  const [billingCompanyAddress, setBillingCompanyAddress] = useState(DEFAULT_COMPANY_BILLING_DETAILS.companyAddress);
  const [billingPaymentAccountName, setBillingPaymentAccountName] = useState(DEFAULT_COMPANY_BILLING_DETAILS.paymentAccountName);
  const [billingBsb, setBillingBsb] = useState(DEFAULT_COMPANY_BILLING_DETAILS.bsb);
  const [billingAccountNumber, setBillingAccountNumber] = useState(DEFAULT_COMPANY_BILLING_DETAILS.accountNumber);
  const [activeTab, setActiveTab] = useState<SettingsTab>('user');
  const [customerRole, setCustomerRole] = useState<'account_owner' | 'read_only'>('read_only');
  const [customerDetails, setCustomerDetails] = useState<CustomerSettingsDetails | null>(null);
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
        setDefaultTheme((result.data.defaultTheme as ThemeModeSetting | null) || 'dark');
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

  useEffect(() => {
    if (roleVariant !== 'customer' || !user?.userId) return;
    let cancelled = false;

    void getCustomerPortalContext(user.userId)
      .then(async (context) => {
        if (cancelled) return;
        setCustomerRole(context.role);

        if (context.role !== 'account_owner' || !context.customerId) {
          setCustomerDetails(null);
          return;
        }

        const result = await getCustomer(context.customerId);
        if (cancelled || (result.errors && result.errors.length > 0)) return;
        setCustomerDetails((result.data as CustomerSettingsDetails | null) ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setCustomerRole('read_only');
          setCustomerDetails(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [roleVariant, user?.userId]);

  const availableTabs = useMemo<Array<{ id: SettingsTab; label: string }>>(
    () => [
      { id: 'user', label: 'User preferences' },
      ...(roleVariant === 'administrator'
        ? [{ id: 'administrator' as const, label: 'Administrator settings' }]
        : []),
      ...(roleVariant === 'customer' && customerRole === 'account_owner'
        ? [{ id: 'customer' as const, label: 'Customer settings' }]
        : []),
    ],
    [customerRole, roleVariant]
  );

  useEffect(() => {
    if (!availableTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab('user');
    }
  }, [activeTab, availableTabs]);

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
      <div>
        <h1 className={styles.heading}>{title}</h1>
        <p className={styles.subtext}>{roleLabel} profile and preferences.</p>
      </div>

      <Card>
        {availableTabs.length > 1 && (
          <Tabs
            items={availableTabs.map((tab) => ({ id: tab.id, label: tab.label }))}
            value={activeTab}
            onChange={(id) => setActiveTab(id as SettingsTab)}
            aria-label="Settings sections"
          />
        )}

        {activeTab === 'user' && (
          <>
            <div className={styles.grid}>
              <Field label="Name" htmlFor="settings-name">
                <Input
                  id="settings-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your display name"
                />
              </Field>

              <Field label="Default Theme" htmlFor="settings-theme">
                <Switch
                  id="settings-theme"
                  checked={defaultTheme !== 'light'}
                  onChange={(event) => setDefaultTheme(event.target.checked ? 'dark' : 'light')}
                  label={defaultTheme !== 'light' ? 'Dark' : 'Light'}
                />
              </Field>

              <Field label="Map Theme" htmlFor="settings-map-theme">
                <Select
                  id="settings-map-theme"
                  value={mapTheme}
                  onChange={(event) => setMapTheme(event.target.value as MapThemeSetting)}
                >
                  {MAP_THEMES.map((theme) => (
                    <option key={theme.key} value={theme.key}>
                      {theme.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className={styles.actions}>
              <Button type="button" loading={pending} disabled={pending} onClick={() => void handleSave()}>
                {pending ? 'Saving...' : 'Save Settings'}
              </Button>
              {message && <p className={styles.message}>{message}</p>}
            </div>

            <p className={styles.currentTheme}>
              Current theme in app: {mode}
            </p>
          </>
        )}

        {activeTab === 'administrator' && roleVariant === 'administrator' && (
          <>
            <div className={styles.grid}>
              <Field label="Billing Company Name" htmlFor="settings-billing-company-name">
                <Input
                  id="settings-billing-company-name"
                  value={billingCompanyName}
                  onChange={(event) => setBillingCompanyName(event.target.value)}
                  placeholder="Company name"
                />
              </Field>

              <Field label="Billing ABN" htmlFor="settings-billing-abn">
                <Input
                  id="settings-billing-abn"
                  value={billingAbn}
                  onChange={(event) => setBillingAbn(event.target.value)}
                  placeholder="ABN"
                />
              </Field>

              <Field label="Billing Phone" htmlFor="settings-billing-phone">
                <Input
                  id="settings-billing-phone"
                  value={billingPhone}
                  onChange={(event) => setBillingPhone(event.target.value)}
                  placeholder="Phone"
                />
              </Field>

              <Field label="Billing Company Address" htmlFor="settings-billing-company-address">
                <Input
                  id="settings-billing-company-address"
                  value={billingCompanyAddress}
                  onChange={(event) => setBillingCompanyAddress(event.target.value)}
                  placeholder="Address"
                />
              </Field>

              <Field label="Payment Account Name" htmlFor="settings-billing-payment-account-name">
                <Input
                  id="settings-billing-payment-account-name"
                  value={billingPaymentAccountName}
                  onChange={(event) => setBillingPaymentAccountName(event.target.value)}
                  placeholder="Account name"
                />
              </Field>

              <Field label="Payment BSB" htmlFor="settings-billing-bsb">
                <Input
                  id="settings-billing-bsb"
                  value={billingBsb}
                  onChange={(event) => setBillingBsb(event.target.value)}
                  placeholder="BSB"
                />
              </Field>

              <Field label="Payment Account Number" htmlFor="settings-billing-account-number">
                <Input
                  id="settings-billing-account-number"
                  value={billingAccountNumber}
                  onChange={(event) => setBillingAccountNumber(event.target.value)}
                  placeholder="Account number"
                />
              </Field>
            </div>

            <div className={styles.actions}>
              <Button type="button" loading={pending} disabled={pending} onClick={() => void handleSave()}>
                {pending ? 'Saving...' : 'Save Settings'}
              </Button>
              {message && <p className={styles.message}>{message}</p>}
            </div>
          </>
        )}

        {activeTab === 'customer' && roleVariant === 'customer' && (
          <div className={styles.readOnlyGrid}>
            <section className={styles.readOnlySection}>
              <h2>Standing instructions</h2>
              <p>{customerDetails?.standingInstructions?.trim() || 'No standing instructions configured.'}</p>
            </section>
            <section className={styles.readOnlySection}>
              <h2>Invoice details</h2>
              <dl className={styles.detailList}>
                <div>
                  <dt>Bill to</dt>
                  <dd>{customerDetails?.name || '—'}</dd>
                </div>
                <div>
                  <dt>Company</dt>
                  <dd>{customerDetails?.companyName || '—'}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{customerDetails?.email || '—'}</dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd>{customerDetails?.addressLine1 || '—'}</dd>
                </div>
              </dl>
            </section>
          </div>
        )}
      </Card>
    </div>
  );
}
