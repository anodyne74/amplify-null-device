'use client';

import { useEffect, useState } from 'react';
import type { Customer, StandingPickupDay } from '@/amplify/types';
import { useCustomerPortalContext, type CustomerPortalContext } from '@/lib/useCustomerPortalContext';
import PageHeader from '@/app/customer/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { AgentBadge } from '@/app/components/ui/core/AgentBadge';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Select } from '@/app/components/ui/forms/Select';
import { Switch } from '@/app/components/ui/forms/Switch';
import styles from './page.module.css';
import { getCustomer, updateCustomer } from '@/lib/customers';
import { normalizeAgentOptions } from '@/lib/customerDefaults';

const COLLECTION_DAYS: { value: StandingPickupDay; label: string }[] = [
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

async function fetchRouteDefaults(context: CustomerPortalContext): Promise<Customer | null> {
  try {
    return (await getCustomer(context.customerId)) as Customer | null;
  } catch {
    throw new Error('Could not load your Route Defaults.');
  }
}

export default function CustomerRouteDefaultsPage() {
  const {
    role: customerRole,
    customerId,
    data: customer,
    setData: setCustomer,
    loading,
    error: loadError,
  } = useCustomerPortalContext({ fetchData: fetchRouteDefaults });

  const [standingInstructions, setStandingInstructions] = useState('');
  const [defaultNumberOfSigns, setDefaultNumberOfSigns] = useState('');
  // '' is "No preference": no Standing Pickup Day stored.
  const [standingPickupDay, setStandingPickupDay] = useState<StandingPickupDay | ''>('');
  const [sendMissingSignsReport, setSendMissingSignsReport] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!customer) return;
    setStandingInstructions(customer.standingInstructions ?? '');
    setDefaultNumberOfSigns(
      typeof customer.defaultNumberOfSigns === 'number' ? String(customer.defaultNumberOfSigns) : ''
    );
    setStandingPickupDay((customer.standingPickupDay as StandingPickupDay | null) ?? '');
    setSendMissingSignsReport(customer.sendMissingSignsReport ?? true);
  }, [customer]);

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

    try {
      await updateCustomer(customerId, {
        standingInstructions,
        defaultNumberOfSigns: parsedSigns,
        // Null clears a stored day; a day that was never set isn't sent at all.
        standingPickupDay: standingPickupDay || (customer?.standingPickupDay ? null : undefined),
        sendMissingSignsReport,
      });
    } catch {
      setSaveError('Could not save your Route Defaults.');
      setSaving(false);
      return;
    }

    const nextCustomer = (await getCustomer(customerId).catch(() => null)) as Customer | null;
    if (nextCustomer) setCustomer(nextCustomer);

    setSaveSuccess('Route Defaults saved.');
    setSaving(false);
  };

  // Same list and order the admin agent editor shows: the first agent is the
  // default, and a legacy customer with only defaultAgentName still gets it.
  const agents =
    normalizeAgentOptions(
      (customer?.agentOptions ?? []).filter((agent): agent is string => Boolean(agent)),
      customer?.defaultAgentName ?? undefined
    ) ?? [];
  const isAccountOwner = customerRole === 'account_owner';
  const lastUpdated = formatUpdatedAt(customer?.updatedAt);

  return (
    <div className={styles.container}>
      <PageHeader title="Route Defaults" subtitle="What every new route we build for you starts from" />

      {loadError && <p className="nd-badge nd-badge--danger">{loadError}</p>}

      {!loading && (
        <div className={styles.layout}>
          <Card title="Sign placement" subtitle="You can still ask for something different on any route">
            {isAccountOwner ? (
              <div className={styles.form}>
                {saveError && <p className="nd-badge nd-badge--danger">{saveError}</p>}
                {saveSuccess && <p className="nd-badge nd-badge--success">{saveSuccess}</p>}

                <Field label="Standing instructions" htmlFor="route-defaults-instructions">
                  <Input
                    id="route-defaults-instructions"
                    multiline
                    value={standingInstructions}
                    onChange={(e) => setStandingInstructions(e.target.value)}
                    placeholder="Instructions for every route, such as gate codes or where to put signs"
                    disabled={saving}
                  />
                </Field>

                <div className={styles.grid}>
                  <Field label="Default signs per stop" htmlFor="route-defaults-default-signs">
                    <Input
                      id="route-defaults-default-signs"
                      type="number"
                      min={0}
                      value={defaultNumberOfSigns}
                      onChange={(e) => setDefaultNumberOfSigns(e.target.value)}
                      disabled={saving}
                    />
                  </Field>
                  <Field
                    label="Standing sign collection day"
                    htmlFor="route-defaults-collection-day"
                    hint="We'll plan sign collection for the next one after your signs go up."
                  >
                    <Select
                      id="route-defaults-collection-day"
                      value={standingPickupDay}
                      onChange={(e) => setStandingPickupDay(e.target.value as StandingPickupDay | '')}
                      disabled={saving}
                    >
                      <option value="">No preference</option>
                      {COLLECTION_DAYS.map((day) => (
                        <option key={day.value} value={day.value}>
                          {day.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                {/* Only once Null Device has switched Missing Signs Reports on for this Customer (#468). */}
                {customer?.missingSignsReportEnabled && (
                  <Switch
                    checked={sendMissingSignsReport}
                    onChange={(e) => setSendMissingSignsReport(e.target.checked)}
                    label="Send a list of missing signs after every sign collection"
                    disabled={saving}
                  />
                )}

                <div className={styles.actions}>
                  <Button type="button" loading={saving} disabled={saving} onClick={() => void handleSave()}>
                    {saving ? 'Saving…' : 'Save Route Defaults'}
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
                    <div className={styles.statLabel}>Sign collection day</div>
                    <div className={styles.statValue}>
                      {COLLECTION_DAYS.find((day) => day.value === standingPickupDay)?.label ?? 'No preference'}
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
            <Card title="Agents on this account" subtitle="Each Stop is labelled with one of these codes">
              {agents.length === 0 ? (
                <p className={styles.mutedText}>No agents configured yet.</p>
              ) : (
                <ul className={styles.agentBadges} aria-label="Agents on this account">
                  {agents.map((agent, index) => (
                    <li key={agent}>
                      <AgentBadge agentName={agent} isDefault={index === 0} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
