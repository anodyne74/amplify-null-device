'use client';

import { useEffect, useState } from 'react';
import type { Customer, StandingPickupDay } from '@/amplify/types';
import { useCustomerPortalContext, type CustomerPortalContext } from '@/lib/useCustomerPortalContext';
import { unwrapOrThrow } from '@/lib/graphqlResult';
import PageHeader from '@/app/customer/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Icon } from '@/app/components/ui/core/Icon';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Select } from '@/app/components/ui/forms/Select';
import { Switch } from '@/app/components/ui/forms/Switch';
import styles from './page.module.css';
import { getCustomer, updateCustomer } from '@/lib/customers';
import { getAgentBadgeInitials, getAgentBadgeTone, normalizeAgentOptions } from '@/lib/customerDefaults';

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

async function fetchOrdersData(context: CustomerPortalContext): Promise<Customer | null> {
  const result = await getCustomer(context.customerId);
  return unwrapOrThrow(result, 'Could not load standing orders.') as Customer | null;
}

export default function CustomerStandingOrdersPage() {
  const {
    role: customerRole,
    customerId,
    data: customer,
    setData: setCustomer,
    loading,
    error: loadError,
  } = useCustomerPortalContext({ fetchData: fetchOrdersData });

  const [standingInstructions, setStandingInstructions] = useState('');
  const [defaultNumberOfSigns, setDefaultNumberOfSigns] = useState('');
  const [standingPickupDay, setStandingPickupDay] = useState<StandingPickupDay>('saturday');
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
    setStandingPickupDay((customer.standingPickupDay as StandingPickupDay | null) ?? 'saturday');
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

    const result = await updateCustomer(customerId, {
      standingInstructions,
      defaultNumberOfSigns: parsedSigns,
      standingPickupDay,
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
                  <Field label="Standing sign collection day" htmlFor="orders-collection-day">
                    <Select
                      id="orders-collection-day"
                      value={standingPickupDay}
                      onChange={(e) => setStandingPickupDay(e.target.value as StandingPickupDay)}
                      disabled={saving}
                    >
                      {COLLECTION_DAYS.map((day) => (
                        <option key={day.value} value={day.value}>
                          {day.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <Switch
                  checked={sendMissingSignsReport}
                  onChange={(e) => setSendMissingSignsReport(e.target.checked)}
                  label="Send a list of missing signs after every sign collection"
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
                    <div className={styles.statLabel}>Sign collection day</div>
                    <div className={styles.statValue}>
                      {COLLECTION_DAYS.find((day) => day.value === standingPickupDay)?.label ?? '—'}
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
              {agents.length === 0 ? (
                <p className={styles.mutedText}>No agents configured yet.</p>
              ) : (
                <ul className={styles.agentBadges} aria-label="Agents on this account">
                  {agents.map((agent, index) => {
                    const isDefault = index === 0;
                    const label = isDefault ? `${agent} (default agent)` : agent;
                    const tone = getAgentBadgeTone(agent);
                    return (
                      <li key={agent}>
                        <span
                          role="img"
                          aria-label={label}
                          title={label}
                          className={styles.agentBadge}
                          style={
                            {
                              '--nd-agent-badge-bg': tone.backgroundColor,
                              '--nd-agent-badge-fg': tone.color,
                            } as React.CSSProperties
                          }
                        >
                          <span aria-hidden="true">{getAgentBadgeInitials(agent)}</span>
                          {isDefault && (
                            <span className={styles.agentDefaultStar} data-testid="default-agent-star" aria-hidden="true">
                              <Icon name="star" size={11} />
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
