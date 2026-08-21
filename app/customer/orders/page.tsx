'use client';

import { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import type { Customer, StandingPickupDay } from '@/amplify/types';
import { getCustomer, getCustomerPortalContext, updateCustomer } from '@/lib/queries';
import PageHeader from '@/app/customer/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Avatar } from '@/app/components/ui/core/Avatar';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Select } from '@/app/components/ui/forms/Select';
import { Switch } from '@/app/components/ui/forms/Switch';
import styles from './page.module.css';

const PICKUP_DAYS: { value: StandingPickupDay; label: string }[] = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
];

function formatUpdatedAt(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CustomerStandingOrdersPage() {
  const { user } = useAuthenticator();
  const [customerRole, setCustomerRole] = useState<'account_owner' | 'read_only'>('read_only');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [standingInstructions, setStandingInstructions] = useState('');
  const [defaultNumberOfSigns, setDefaultNumberOfSigns] = useState('');
  const [standingPickupDay, setStandingPickupDay] = useState<StandingPickupDay>('saturday');
  const [notifyOnLowSigns, setNotifyOnLowSigns] = useState(true);
  const [sendMissingSignsReport, setSendMissingSignsReport] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.userId) return;
    let cancelled = false;

    void getCustomerPortalContext(user.userId)
      .then(async (context) => {
        if (cancelled) return;
        setCustomerRole(context.role);
        setCustomerId(context.customerId);

        if (!context.customerId) {
          setLoadError('Could not resolve your customer account.');
          setLoading(false);
          return;
        }

        const result = await getCustomer(context.customerId);
        if (cancelled) return;

        if (result.errors && result.errors.length > 0) {
          const firstError = result.errors[0] as { message?: string } | undefined;
          setLoadError(firstError?.message ?? 'Could not load standing orders.');
          setLoading(false);
          return;
        }

        const nextCustomer = result.data as Customer | null;
        setCustomer(nextCustomer);
        setStandingInstructions(nextCustomer?.standingInstructions ?? '');
        setDefaultNumberOfSigns(
          typeof nextCustomer?.defaultNumberOfSigns === 'number' ? String(nextCustomer.defaultNumberOfSigns) : ''
        );
        setStandingPickupDay((nextCustomer?.standingPickupDay as StandingPickupDay | null) ?? 'saturday');
        setNotifyOnLowSigns(nextCustomer?.notifyOnLowSigns ?? true);
        setSendMissingSignsReport(nextCustomer?.sendMissingSignsReport ?? true);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('Could not load standing orders.');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user?.userId]);

  const handleSave = async () => {
    if (!customerId) {
      setSaveError('Customer account could not be resolved.');
      return;
    }

    const parsedSigns = defaultNumberOfSigns.trim() ? Number(defaultNumberOfSigns) : undefined;
    if (defaultNumberOfSigns.trim() && (Number.isNaN(parsedSigns) || parsedSigns! < 0)) {
      setSaveError('Default signs per stop must be 0 or greater.');
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const result = await updateCustomer(customerId, {
      standingInstructions,
      defaultNumberOfSigns: parsedSigns,
      standingPickupDay,
      notifyOnLowSigns,
      sendMissingSignsReport,
    });

    if (result.errors && result.errors.length > 0) {
      const firstError = result.errors[0] as { message?: string } | undefined;
      setSaveError(firstError?.message ?? 'Could not save standing orders.');
      setSaving(false);
      return;
    }

    const refreshed = await getCustomer(customerId);
    const nextCustomer = refreshed.data as Customer | null;
    if (nextCustomer) setCustomer(nextCustomer);

    setSaveSuccess('Preferences saved.');
    setSaving(false);
  };

  const agentOptions = customer?.agentOptions ?? [];
  const isAccountOwner = customerRole === 'account_owner';
  const lastUpdated = formatUpdatedAt(customer?.updatedAt);

  return (
    <div className={styles.container}>
      <PageHeader title="Standing Orders" subtitle="Your default placement preferences" />

      {loadError && <p className="nd-badge nd-badge--danger">{loadError}</p>}

      {!loading && (
        <div className={styles.layout}>
          <Card title="Sign placement preferences" subtitle="Every route we build for you starts from this">
            {isAccountOwner ? (
              <div className={styles.form}>
                {saveError && <p className="nd-badge nd-badge--danger">{saveError}</p>}
                {saveSuccess && <p className="nd-badge nd-badge--success">{saveSuccess}</p>}

                <Field label="Standing instructions" htmlFor="orders-instructions">
                  <Input
                    id="orders-instructions"
                    multiline
                    value={standingInstructions}
                    onChange={(e) => setStandingInstructions(e.target.value)}
                    placeholder="Instructions operators should see by default"
                    disabled={saving}
                  />
                </Field>

                <div className={styles.grid}>
                  <Field label="Default signs per stop" htmlFor="orders-default-signs">
                    <Input
                      id="orders-default-signs"
                      type="number"
                      min={0}
                      value={defaultNumberOfSigns}
                      onChange={(e) => setDefaultNumberOfSigns(e.target.value)}
                      disabled={saving}
                    />
                  </Field>
                  <Field label="Standing pickup day" htmlFor="orders-pickup-day">
                    <Select
                      id="orders-pickup-day"
                      value={standingPickupDay}
                      onChange={(e) => setStandingPickupDay(e.target.value as StandingPickupDay)}
                      disabled={saving}
                    >
                      {PICKUP_DAYS.map((day) => (
                        <option key={day.value} value={day.value}>
                          {day.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <Switch
                  checked={notifyOnLowSigns}
                  onChange={(e) => setNotifyOnLowSigns(e.target.checked)}
                  label="Tell us if you run short of signs and update the count"
                  disabled={saving}
                />
                <Switch
                  checked={sendMissingSignsReport}
                  onChange={(e) => setSendMissingSignsReport(e.target.checked)}
                  label="Send a list of missing signs after every pickup"
                  disabled={saving}
                />

                <div className={styles.actions}>
                  <Button type="button" loading={saving} disabled={saving} onClick={() => void handleSave()}>
                    {saving ? 'Saving…' : 'Save preferences'}
                  </Button>
                  {lastUpdated && <span className={styles.savedNote}>Last saved {lastUpdated} · applies from the next route</span>}
                </div>
              </div>
            ) : (
              <div className={styles.readOnly}>
                <div className={styles.instructionsBlock}>
                  {standingInstructions || 'No standing instructions configured.'}
                </div>
                <div className={styles.readOnlyStats}>
                  <div>
                    <div className={styles.statLabel}>Default signs</div>
                    <div className={styles.statValue}>{defaultNumberOfSigns || '—'}</div>
                  </div>
                  <div>
                    <div className={styles.statLabel}>Pickup day</div>
                    <div className={styles.statValue}>
                      {PICKUP_DAYS.find((day) => day.value === standingPickupDay)?.label ?? '—'}
                    </div>
                  </div>
                  <div>
                    <div className={styles.statLabel}>Last updated</div>
                    <div className={styles.statValue}>{lastUpdated ?? '—'}</div>
                  </div>
                </div>
                <p className={styles.mutedText}>
                  Only your account owner can change these. Route-specific asks belong on the route as special instructions.
                </p>
              </div>
            )}
          </Card>

          <div className={styles.sidebar}>
            <Card title="Agents on this account" subtitle="Codes appear on the operator run sheet">
              {agentOptions.length === 0 ? (
                <p className={styles.mutedText}>No agents configured yet.</p>
              ) : (
                <div className={styles.agentList}>
                  {agentOptions.map((agent) => (
                    <div key={agent} className={styles.agentRow}>
                      <Avatar name={agent} size="sm" />
                      <span className={styles.agentName}>{agent}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
