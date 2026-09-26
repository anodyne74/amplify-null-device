'use client';

import { useEffect, useState } from 'react';
import OperatorRoute from '@/app/components/OperatorRoute';
import PageHeader from '@/app/administrator/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Badge } from '@/app/components/ui/core/Badge';
import { Button } from '@/app/components/ui/core/Button';
import { Checkbox } from '@/app/components/ui/forms/Checkbox';
import { Field } from '@/app/components/ui/forms/Field';
import { Select } from '@/app/components/ui/forms/Select';
import {
  FEATURE_FLAGS,
  FEATURE_FLAG_NAMES,
  type FeatureFlagChange,
  type FeatureFlagName,
  type FeatureFlagSettingRecord,
  type FeatureFlagState,
} from '@/lib/featureFlags';
import { changeFeatureFlag, listFeatureFlagSettings } from '@/lib/queries/FeatureFlagSettings';
import { listAllCustomers } from '@/lib/customers';
import styles from './page.module.css';

const STATE_OPTIONS: { value: FeatureFlagState; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'selected', label: 'Selected Customers' },
  { value: 'everyone', label: 'Everyone' },
];

interface CustomerOption {
  id: string;
  name: string;
}

function formatEveryoneSince(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Feature Flags (ADR 0005): one card per flag registered in lib/featureFlags.ts.
 * Stored settings for flags no longer registered are never shown. Every change
 * goes through /api/admin/feature-flags, which audits it.
 */
export default function AdministratorFeatureFlagsPage() {
  const [settings, setSettings] = useState<Record<string, FeatureFlagSettingRecord>>({});
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(FEATURE_FLAG_NAMES.length > 0);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (FEATURE_FLAG_NAMES.length === 0) return;
    let cancelled = false;

    void Promise.all([listFeatureFlagSettings(), listAllCustomers()]).then(([settingsResult, customersResult]) => {
      if (cancelled) return;
      if (settingsResult.errors || customersResult.errors) {
        setLoadError('Could not load feature flags. Refresh to try again.');
      } else {
        setSettings(Object.fromEntries(settingsResult.data.map((setting) => [setting.id, setting])));
        setCustomers(
          customersResult.data
            .map((customer) => ({ id: customer.id, name: customer.name || customer.id }))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.page}>
        <PageHeader title="Feature Flags" subtitle="Roll out new customer portal features Customer by Customer" />

        {FEATURE_FLAG_NAMES.length === 0 ? (
          <Card>
            <p className={styles.emptyState}>
              No feature flags right now. A flag appears here when a new customer portal feature is ready to roll out.
            </p>
          </Card>
        ) : loading ? (
          <p className={styles.note}>Loading feature flags…</p>
        ) : loadError ? (
          <p className="nd-badge nd-badge--danger">{loadError}</p>
        ) : (
          FEATURE_FLAG_NAMES.map((name) => (
            <FeatureFlagCard
              key={name}
              name={name}
              setting={settings[name] ?? null}
              customers={customers}
              onSaved={(setting) => setSettings((current) => ({ ...current, [name]: setting }))}
            />
          ))
        )}
      </div>
    </OperatorRoute>
  );
}

function FeatureFlagCard({
  name,
  setting,
  customers,
  onSaved,
}: {
  name: FeatureFlagName;
  setting: FeatureFlagSettingRecord | null;
  customers: CustomerOption[];
  onSaved: (setting: FeatureFlagSettingRecord) => void;
}) {
  const definition = FEATURE_FLAGS[name] as { label: string; description: string };
  const state = setting?.state ?? 'off';
  const savedIds = (setting?.selectedCustomerIds ?? []).filter((id): id is string => !!id);
  const [draftIds, setDraftIds] = useState<string[]>(savedIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const savedKey = [...savedIds].sort().join(',');
  useEffect(() => {
    setDraftIds(savedKey ? savedKey.split(',') : []);
  }, [savedKey]);

  const listChanged = [...draftIds].sort().join(',') !== savedKey;

  async function apply(change: FeatureFlagChange) {
    setSaving(true);
    setError(null);
    try {
      const saved = await changeFeatureFlag(name, change);
      if (saved) onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the change.');
    } finally {
      setSaving(false);
    }
  }

  function toggleCustomer(customerId: string, checked: boolean) {
    setDraftIds((current) => (checked ? [...current, customerId] : current.filter((id) => id !== customerId)));
  }

  return (
    <Card title={definition.label} subtitle={definition.description}>
      <div className={styles.flag}>
        {error && <p className="nd-badge nd-badge--danger">{error}</p>}

        <div className={styles.stateRow}>
          <Field label="State" htmlFor={`ff-state-${name}`}>
            <Select
              id={`ff-state-${name}`}
              className={styles.stateSelect}
              options={STATE_OPTIONS}
              value={state}
              disabled={saving}
              onChange={(e) => void apply({ action: 'set-state', state: e.target.value as FeatureFlagState })}
            />
          </Field>
          {state === 'everyone' && setting?.everyoneSince && (
            <Badge tone="success">Everyone since {formatEveryoneSince(setting.everyoneSince)}</Badge>
          )}
        </div>

        {state === 'selected' && (
          <>
            <p className={styles.note}>
              On for {savedIds.length} Customer{savedIds.length === 1 ? '' : 's'}.
            </p>
            <div className={styles.customerList} role="group" aria-label="Selected Customers">
              {customers.map((customer) => (
                <Checkbox
                  key={customer.id}
                  label={customer.name}
                  checked={draftIds.includes(customer.id)}
                  disabled={saving}
                  onChange={(e) => toggleCustomer(customer.id, e.target.checked)}
                />
              ))}
            </div>
          </>
        )}

        {state === 'off' && savedIds.length > 0 && (
          <p className={styles.note}>
            {savedIds.length} Selected Customer{savedIds.length === 1 ? ' is' : 's are'} kept for when this flag is
            switched back to Selected Customers.
          </p>
        )}

        {(state === 'selected' || savedIds.length > 0) && (
          <div className={styles.actions}>
            {state === 'selected' && (
              <Button
                size="sm"
                disabled={saving || !listChanged}
                onClick={() => void apply({ action: 'set-customers', customerIds: draftIds })}
              >
                Save Customers
              </Button>
            )}
            {savedIds.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                disabled={saving}
                onClick={() => void apply({ action: 'clear-customers' })}
              >
                Clear list
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
