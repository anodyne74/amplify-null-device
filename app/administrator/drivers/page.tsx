'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import OperatorRoute from '@/app/components/OperatorRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import PageHeader from '@/app/administrator/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Badge } from '@/app/components/ui/core/Badge';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Select } from '@/app/components/ui/forms/Select';
import { Switch } from '@/app/components/ui/forms/Switch';
import { StatTile } from '@/app/components/ui/data/StatTile';
import { DataTable, type DataColumn } from '@/app/components/ui/data/DataTable';
import { listOperators } from '@/lib/queries/ListOperators';
import { updateOperator } from '@/lib/queries/UpdateOperator';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';
import type { BillingCycle, Operator, OperatorStatus } from '@/amplify/types';
import styles from './page.module.css';

type CognitoOperator = {
  id?: string;
  name?: string;
  email?: string;
  createdAt?: string;
};

type CustomerSummary = { id: string; name: string };

// A Driver is an Operator record joined to its Cognito identity — see the
// Operator model's doc comment in amplify/data/resource.ts: Driver and
// Operator are the same person/record. Cognito is the source of truth for
// who exists (name/email/login); the Operator DynamoDB row carries the
// driver-specific profile fields this screen edits.
type Driver = {
  id: string;
  name: string;
  email: string;
  phone: string;
  vehicleAndRego: string;
  homeBase: string;
  status: OperatorStatus;
  driverSplitPercent: number | '';
  payCycle: BillingCycle;
  paySplitOnCompletedStopsOnly: boolean;
  assignedCustomerIds: string[];
};

const PAY_CYCLES: BillingCycle[] = ['weekly', 'fortnightly', 'monthly'];

function toDriver(cognitoUser: CognitoOperator, record?: Operator): Driver {
  return {
    id: cognitoUser.id || record?.id || '',
    name: record?.name || cognitoUser.name || 'Unknown driver',
    email: record?.email || cognitoUser.email || '',
    phone: record?.phone || '',
    vehicleAndRego: record?.vehicleAndRego || '',
    homeBase: record?.homeBase || '',
    status: record?.status || 'onboarding',
    driverSplitPercent: record?.driverSplitPercent ?? '',
    payCycle: record?.payCycle || 'fortnightly',
    paySplitOnCompletedStopsOnly: record?.paySplitOnCompletedStopsOnly ?? true,
    assignedCustomerIds: record?.assignedCustomerIds || [],
  };
}

function statusTone(status: OperatorStatus): 'success' | 'warning' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'onboarding') return 'warning';
  return 'neutral';
}

export default function AdministratorDriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [assignCustomerId, setAssignCustomerId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) throw new Error('No session token found. Please sign in again.');

      const [usersResponse, operatorsResult, customersResult] = await Promise.all([
        fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ action: 'listUsersInGroup', groupName: 'operator' }),
        }),
        listOperators(),
        listAllCustomers({ limit: 200 }),
      ]);

      const usersPayload = await usersResponse.json();
      if (!usersResponse.ok) throw new Error(usersPayload?.error || 'Could not load drivers.');

      const cognitoOperators = (usersPayload.users as CognitoOperator[]) || [];
      const records = (operatorsResult.data as Operator[]) || [];
      const recordsById = new Map(records.map((r) => [r.id, r]));

      const merged = cognitoOperators
        .filter((u) => u.id)
        .map((u) => toDriver(u, recordsById.get(u.id!)))
        .sort((a, b) => a.name.localeCompare(b.name));

      setDrivers(merged);
      setCustomers((customersResult.data as CustomerSummary[]) || []);
      setSelectedId((current) => (current && merged.some((d) => d.id === current) ? current : merged[0]?.id || ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load drivers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(() => drivers.find((d) => d.id === selectedId) || null, [drivers, selectedId]);

  const updateSelected = (patch: Partial<Driver>) => {
    if (!selected) return;
    setDrivers((prev) => prev.map((d) => (d.id === selected.id ? { ...d, ...patch } : d)));
  };

  const persist = async (id: string, updates: Partial<Driver>, appliedFields: Parameters<typeof updateOperator>[1]) => {
    setSaving(true);
    setSaveError(null);
    const result = await updateOperator(id, appliedFields);
    if (result.errors && result.errors.length > 0) {
      setSaveError('Could not save that change.');
    } else {
      setDrivers((prev) => prev.map((d) => (d.id === id ? { ...d, ...updates } : d)));
    }
    setSaving(false);
  };

  const handleSaveDriver = async () => {
    if (!selected) return;
    await persist(
      selected.id,
      {},
      {
        phone: selected.phone || undefined,
        vehicleAndRego: selected.vehicleAndRego || undefined,
        homeBase: selected.homeBase || undefined,
        driverSplitPercent: selected.driverSplitPercent === '' ? undefined : Number(selected.driverSplitPercent),
        payCycle: selected.payCycle,
        paySplitOnCompletedStopsOnly: selected.paySplitOnCompletedStopsOnly,
      }
    );
  };

  const handleDeactivate = async () => {
    if (!selected) return;
    await persist(selected.id, { status: 'inactive' }, { status: 'inactive' });
  };

  const handleAssignCustomer = async () => {
    if (!selected || !assignCustomerId) return;
    if (selected.assignedCustomerIds.includes(assignCustomerId)) return;
    const nextIds = [...selected.assignedCustomerIds, assignCustomerId];
    await persist(selected.id, { assignedCustomerIds: nextIds }, { assignedCustomerIds: nextIds });
    setAssignCustomerId('');
  };

  const handleRemoveCustomer = async (customerId: string) => {
    if (!selected) return;
    const nextIds = selected.assignedCustomerIds.filter((id) => id !== customerId);
    await persist(selected.id, { assignedCustomerIds: nextIds }, { assignedCustomerIds: nextIds });
  };

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? id.slice(0, 8);
  const unassignedCustomers = customers.filter((c) => !selected?.assignedCustomerIds.includes(c.id));

  const activeCount = drivers.filter((d) => d.status === 'active').length;
  const onboardingCount = drivers.filter((d) => d.status === 'onboarding').length;
  const splitValues = drivers.map((d) => d.driverSplitPercent).filter((v): v is number => v !== '');
  const avgSplit = splitValues.length > 0 ? splitValues.reduce((sum, v) => sum + v, 0) / splitValues.length : null;
  const totalAssignments = drivers.reduce((sum, d) => sum + d.assignedCustomerIds.length, 0);
  const unassignedDriverCount = drivers.filter((d) => d.assignedCustomerIds.length === 0).length;

  const columns: DataColumn<Driver>[] = [
    {
      key: 'name',
      header: 'Driver',
      render: (row) => (
        <button type="button" className={styles.driverLink} onClick={() => setSelectedId(row.id)}>
          {row.name}
        </button>
      ),
    },
    { key: 'email', header: 'Email' },
    { key: 'vehicle', header: 'Vehicle', render: (row) => row.vehicleAndRego || '—' },
    { key: 'homeBase', header: 'Home base', render: (row) => row.homeBase || '—' },
    {
      key: 'split',
      header: 'Driver split',
      numeric: true,
      render: (row) => (row.driverSplitPercent === '' ? '—' : `${row.driverSplitPercent}%`),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={statusTone(row.status)} dot>
          {row.status === 'active' ? 'Active' : row.status === 'onboarding' ? 'Onboarding' : 'Inactive'}
        </Badge>
      ),
    },
  ];

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.page}>
        <PageHeader
          title="Drivers"
          subtitle="Roster, vehicles and pay split for everyone in the operator group"
        />

        {error && (
          <div className={styles.errorBanner} role="alert" aria-live="assertive">
            {error}
          </div>
        )}

        <div className={styles.statsGrid}>
          <StatTile label="Drivers active" value={activeCount} caption={`${onboardingCount} onboarding`} icon="truck" />
          <StatTile label="Total drivers" value={drivers.length} caption={`${drivers.length - activeCount - onboardingCount} inactive`} icon="users" />
          <StatTile
            label="Avg driver split"
            value={avgSplit === null ? '—' : `${avgSplit.toFixed(1)}%`}
            caption="of what we bill"
            icon="chart-column"
          />
          <StatTile
            label="Customers assigned"
            value={totalAssignments}
            caption={`${unassignedDriverCount} drivers unassigned`}
            icon="route"
          />
        </div>

        <Card
          title="Drivers"
          subtitle="A driver's login is added from Users → operator group. Pick a driver here to configure their profile and split."
          padded={false}
        >
          {loading ? (
            <div style={{ padding: 'var(--space-6)' }}>
              <LoadingSpinner message="Loading drivers..." />
            </div>
          ) : (
            <DataTable columns={columns} rows={drivers} empty="No drivers yet. Add one via Users → operator group." />
          )}
        </Card>

        {selected && (
          <div className={styles.detailGrid}>
            <Card title={selected.name} subtitle="Driver setup">
              <div className={styles.form}>
                {saveError && <p className="nd-badge nd-badge--danger">{saveError}</p>}
                <div className={styles.formRow}>
                  <Badge tone={statusTone(selected.status)} dot>
                    {selected.status === 'active' ? 'Active' : selected.status === 'onboarding' ? 'Onboarding' : 'Inactive'}
                  </Badge>
                  <span className={styles.formHint}>{selected.assignedCustomerIds.length} customer(s) assigned</span>
                </div>
                <div className={styles.formGrid}>
                  <Field label="Mobile" htmlFor="driver-phone">
                    <Input
                      id="driver-phone"
                      value={selected.phone}
                      onChange={(e) => updateSelected({ phone: e.target.value })}
                    />
                  </Field>
                  <Field label="Email" htmlFor="driver-email">
                    <Input id="driver-email" value={selected.email} disabled />
                  </Field>
                </div>
                <Field label="Vehicle and rego" htmlFor="driver-vehicle">
                  <Input
                    id="driver-vehicle"
                    value={selected.vehicleAndRego}
                    onChange={(e) => updateSelected({ vehicleAndRego: e.target.value })}
                  />
                </Field>
                <Field label="Home base" hint="Routes are built outwards from here" htmlFor="driver-home-base">
                  <Input
                    id="driver-home-base"
                    value={selected.homeBase}
                    onChange={(e) => updateSelected({ homeBase: e.target.value })}
                  />
                </Field>
                <div className={styles.formActions}>
                  <Button type="button" loading={saving} disabled={saving} onClick={() => void handleSaveDriver()}>
                    Save driver
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={saving || selected.status === 'inactive'}
                    onClick={() => void handleDeactivate()}
                  >
                    Deactivate
                  </Button>
                </div>
              </div>
            </Card>

            <div className={styles.sideCards}>
              <Card title="Pay split" subtitle="Internal — never shown to customers">
                <div className={styles.form}>
                  <div className={styles.callout}>
                    Not yet applied to payouts — payout calculations still use the customer&apos;s rate-card split for
                    every operator on that customer&apos;s routes. Captured here ahead of per-driver overrides.
                  </div>
                  <div className={styles.formGrid}>
                    <Field label="Driver split" hint="Percentage of each billed line" htmlFor="driver-split">
                      <Input
                        id="driver-split"
                        type="number"
                        min={0}
                        max={100}
                        value={selected.driverSplitPercent}
                        onChange={(e) =>
                          updateSelected({ driverSplitPercent: e.target.value === '' ? '' : Number(e.target.value) })
                        }
                      />
                    </Field>
                    <Field label="Pay cycle" htmlFor="driver-pay-cycle">
                      <Select
                        id="driver-pay-cycle"
                        value={selected.payCycle}
                        onChange={(e) => updateSelected({ payCycle: e.target.value as BillingCycle })}
                      >
                        {PAY_CYCLES.map((cycle) => (
                          <option key={cycle} value={cycle}>
                            {cycle[0].toUpperCase() + cycle.slice(1)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Switch
                    checked={selected.paySplitOnCompletedStopsOnly}
                    onChange={(e) => updateSelected({ paySplitOnCompletedStopsOnly: e.target.checked })}
                    label="Pay on completed stops only"
                  />
                </div>
              </Card>

              <Card title="Customers covered" subtitle="Routes for these accounts come to this driver first">
                <div className={styles.form}>
                  {selected.assignedCustomerIds.length > 0 ? (
                    <div className={styles.customerList}>
                      {selected.assignedCustomerIds.map((customerId) => (
                        <div key={customerId} className={styles.customerRow}>
                          <span className={styles.customerName}>{customerName(customerId)}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={saving}
                            onClick={() => void handleRemoveCustomer(customerId)}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className={styles.formHint}>No accounts yet. Assign one to start rostering this driver.</span>
                  )}
                  {unassignedCustomers.length > 0 && (
                    <div className={styles.assignRow}>
                      <Select
                        value={assignCustomerId}
                        onChange={(e) => setAssignCustomerId(e.target.value)}
                        aria-label="Customer to assign"
                      >
                        <option value="">Select a customer…</option>
                        {unassignedCustomers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        iconLeft="plus"
                        disabled={!assignCustomerId || saving}
                        onClick={() => void handleAssignCustomer()}
                      >
                        Assign customer
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </OperatorRoute>
  );
}
