'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import OperatorRoute from '@/app/components/OperatorRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import PageHeader from '@/app/administrator/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Badge } from '@/app/components/ui/core/Badge';
import { Avatar } from '@/app/components/ui/core/Avatar';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Select } from '@/app/components/ui/forms/Select';
import { Switch } from '@/app/components/ui/forms/Switch';
import { StatTile } from '@/app/components/ui/data/StatTile';
import { DataTable, type DataColumn } from '@/app/components/ui/data/DataTable';
import { listOperators } from '@/lib/queries/ListOperators';
import { updateOperator } from '@/lib/queries/UpdateOperator';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';
import { listAllRoutes } from '@/lib/queries/ListAllRoutes';
import { listAllStops } from '@/lib/queries/ListAllStops';
import { getDateGroup } from '@/lib/aggregateRouteData';
import { formatDurationCompact } from '@/lib/dashboardAnalytics';
import { summarizeRoutesStopsThisMonth, summarizeAverageRouteDuration } from '@/lib/adminDashboardOverview';
import type { BillingCycle, Operator, OperatorStatus, Route } from '@/amplify/types';
import styles from './page.module.css';

type CognitoOperator = {
  id?: string;
  name?: string;
  email?: string;
  createdAt?: string;
};

type CustomerSummary = { id: string; name: string };

type StopSummary = { id: string; routeId?: string | null };

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

function statusLabel(status: OperatorStatus): string {
  return status === 'active' ? 'Active' : status === 'onboarding' ? 'Onboarding' : 'Inactive';
}

export default function AdministratorDriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [stops, setStops] = useState<StopSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [assignCustomerId, setAssignCustomerId] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [invitePending, setInvitePending] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [resendPending, setResendPending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  const callAdminApi = useCallback(async (body: Record<string, unknown>) => {
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken?.toString();
    if (!idToken) throw new Error('No session token found. Please sign in again.');

    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Request failed.');
    }
    return payload;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) throw new Error('No session token found. Please sign in again.');

      const fetchAllRoutes = async () => {
        const allRoutes: Route[] = [];
        let nextToken: string | undefined;
        do {
          const pageResult = await listAllRoutes({ limit: 500, nextToken });
          if (pageResult.errors && pageResult.errors.length > 0) break;
          allRoutes.push(...((pageResult.data as Route[]) || []));
          nextToken = pageResult.nextToken ?? undefined;
        } while (nextToken);
        return allRoutes;
      };

      const fetchAllStops = async () => {
        const allStops: StopSummary[] = [];
        let nextToken: string | undefined;
        do {
          const pageResult = await listAllStops({ limit: 500, nextToken });
          if (pageResult.errors && pageResult.errors.length > 0) break;
          allStops.push(...((pageResult.data as StopSummary[]) || []));
          nextToken = pageResult.nextToken ?? undefined;
        } while (nextToken);
        return allStops;
      };

      const [usersResponse, operatorsResult, customersResult, allRoutes, allStops] = await Promise.all([
        fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ action: 'listUsersInGroup', groupName: 'operator' }),
        }),
        listOperators(),
        listAllCustomers({ limit: 200 }),
        fetchAllRoutes(),
        fetchAllStops(),
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
      setRoutes(allRoutes);
      setStops(allStops);
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

  const handleInviteDriver = async () => {
    const email = inviteEmail.trim();
    if (!email) {
      setInviteError('Driver email is required.');
      return;
    }

    setInvitePending(true);
    setInviteError(null);
    setInviteSuccess(null);

    try {
      const result = await callAdminApi({
        action: 'createUser',
        email,
        name: inviteName.trim() || undefined,
        groupName: 'operator',
      });

      setInviteSuccess(
        result.created
          ? result.emailSent
            ? 'Invited — they’ll get an email with a temporary password.'
            : 'Login created, but the invitation email could not be sent. Ask them to use "Forgot password" to get access.'
          : 'Already had a login — added them to the operator group.'
      );
      setInviteEmail('');
      setInviteName('');
      await load();
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Could not invite that driver.');
    }

    setInvitePending(false);
  };

  const handleResendInvite = async () => {
    if (!selected) return;
    setResendPending(true);
    setResendMessage(null);
    setSaveError(null);
    try {
      const result = await callAdminApi({
        action: 'resendInvite',
        email: selected.email,
        groupName: 'operator',
        name: selected.name,
      });
      setResendMessage(
        result.emailSent
          ? `Invitation resent to ${selected.email}.`
          : `Invitation reset for ${selected.email}, but the email could not be sent. Ask them to use "Forgot password".`
      );
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not resend that invite.');
    }
    setResendPending(false);
  };

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? id.slice(0, 8);
  const unassignedCustomers = customers.filter((c) => !selected?.assignedCustomerIds.includes(c.id));

  const activeCount = drivers.filter((d) => d.status === 'active').length;
  const onboardingCount = drivers.filter((d) => d.status === 'onboarding').length;
  const splitValues = drivers.map((d) => d.driverSplitPercent).filter((v): v is number => v !== '');
  const avgSplit = splitValues.length > 0 ? splitValues.reduce((sum, v) => sum + v, 0) / splitValues.length : null;

  const routesStops = useMemo(() => summarizeRoutesStopsThisMonth(routes, stops), [routes, stops]);
  const avgDuration = useMemo(() => summarizeAverageRouteDuration(routes, stops), [routes, stops]);

  // Routes assigned to each driver this calendar month, for the "N routes
  // this month" hint in the detail panel below.
  const routesThisMonthByDriver = useMemo(() => {
    const thisMonthKey = getDateGroup(new Date().toISOString(), 'month');
    const counts = new Map<string, number>();
    routes.forEach((route) => {
      const date = route.actualEndTime || route.actualStartTime || route.createdAt;
      if (!date || !route.assignedOperatorSub) return;
      if (getDateGroup(date, 'month') !== thisMonthKey) return;
      counts.set(route.assignedOperatorSub, (counts.get(route.assignedOperatorSub) || 0) + 1);
    });
    return counts;
  }, [routes]);

  const columns: DataColumn<Driver>[] = [
    {
      key: 'name',
      header: 'Driver',
      render: (row) => (
        <div className={styles.driverCell}>
          <Avatar name={row.name} size="sm" />
          <div>
            <div className={styles.driverCellName}>{row.name}</div>
            <div className={styles.driverCellMeta}>{row.homeBase ? `based ${row.homeBase}` : 'Home base not set'}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={statusTone(row.status)} dot>
          {statusLabel(row.status)}
        </Badge>
      ),
    },
    { key: 'vehicle', header: 'Vehicle', render: (row) => row.vehicleAndRego || '—' },
    {
      key: 'split',
      header: 'Split',
      align: 'right',
      render: (row) => (row.driverSplitPercent === '' ? '—' : `${row.driverSplitPercent}%`),
    },
    {
      key: 'covers',
      header: 'Covers',
      render: (row) =>
        row.assignedCustomerIds.length === 0
          ? 'Unassigned'
          : `${row.assignedCustomerIds.length} customer${row.assignedCustomerIds.length === 1 ? '' : 's'}`,
    },
    {
      key: 'action',
      header: '',
      width: 120,
      align: 'right',
      render: (row) => (
        <Button
          type="button"
          variant={row.id === selectedId ? 'secondary' : 'ghost'}
          size="sm"
          aria-label={`Configure ${row.name}`}
          onClick={() => setSelectedId(row.id)}
        >
          {row.id === selectedId ? 'Configuring' : 'Configure'}
        </Button>
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
          <StatTile
            label="Routes this month"
            value={loading ? '…' : routesStops.currentRoutes}
            delta={loading ? undefined : `${routesStops.deltaPercent}%`}
            direction={loading ? 'flat' : routesStops.direction}
            caption={`${routesStops.stopsServiced.toLocaleString()} stops serviced`}
            icon="route"
          />
          <StatTile
            label="Avg driver split"
            value={avgSplit === null ? '—' : `${avgSplit.toFixed(1)}%`}
            caption="of what we bill"
            icon="chart-column"
          />
          <StatTile
            label="Average route duration"
            value={loading || avgDuration.currentAverageMinutes === null ? '—' : formatDurationCompact(avgDuration.currentAverageMinutes)}
            delta={loading || avgDuration.currentAverageMinutes === null ? undefined : `${avgDuration.deltaPercent}%`}
            direction={loading ? 'flat' : avgDuration.direction}
            caption={
              avgDuration.averageStopsPerRoute === null
                ? 'No completed routes yet'
                : `${avgDuration.averageStopsPerRoute.toFixed(1)} stops per route`
            }
            icon="timer"
          />
        </div>

        <Card title="Invite a driver" subtitle="They’ll get a login in the operator group and show up below as onboarding.">
          <div className={styles.form}>
            {inviteError && (
              <div className={styles.errorBanner} role="alert" aria-live="assertive">
                {inviteError}
              </div>
            )}
            {inviteSuccess && (
              <div className={styles.successBanner} role="status" aria-live="polite">
                {inviteSuccess}
              </div>
            )}
            <div className={styles.inviteForm}>
              <Field label="Email" htmlFor="invite-driver-email" className={styles.inviteField}>
                <Input
                  id="invite-driver-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="driver@nulldevice.dev"
                  disabled={invitePending}
                  aria-label="Email for new driver"
                />
              </Field>
              <Field label="Display Name" htmlFor="invite-driver-name" className={styles.inviteField}>
                <Input
                  id="invite-driver-name"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Display name (optional)"
                  disabled={invitePending}
                  aria-label="Optional display name for new driver"
                />
              </Field>
              <Button
                type="button"
                iconLeft="plus"
                loading={invitePending}
                disabled={invitePending || !inviteEmail.trim()}
                onClick={() => void handleInviteDriver()}
              >
                {invitePending ? 'Sending...' : 'Send invite'}
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Drivers" subtitle="Pick a driver to configure their roster, vehicle and split" padded={false}>
          {loading ? (
            <div style={{ padding: 'var(--space-6)' }}>
              <LoadingSpinner message="Loading drivers..." />
            </div>
          ) : (
            <DataTable columns={columns} rows={drivers} empty="No drivers yet. Invite one above." />
          )}
        </Card>

        {selected && (
          <Card title={selected.name} subtitle="Driver setup">
            <div className={styles.detailLayout}>
              <div className={styles.form}>
                {saveError && <p className="nd-badge nd-badge--danger">{saveError}</p>}
                <div className={styles.formRow}>
                  <Badge tone={statusTone(selected.status)} dot>
                    {statusLabel(selected.status)}
                  </Badge>
                  <span className={styles.formHint}>
                    {routesThisMonthByDriver.get(selected.id) || 0} routes this month · {selected.assignedCustomerIds.length}{' '}
                    customer(s) assigned
                  </span>
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
                {resendMessage && (
                  <p className={styles.formHint} role="status" aria-live="polite">
                    {resendMessage}
                  </p>
                )}
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
                  {selected.status === 'onboarding' && (
                    <Button
                      type="button"
                      variant="secondary"
                      iconLeft="send"
                      loading={resendPending}
                      disabled={resendPending}
                      onClick={() => void handleResendInvite()}
                    >
                      Resend invite
                    </Button>
                  )}
                </div>
              </div>

              <div className={styles.detailSide}>
                <div className={styles.form}>
                  <span className={styles.sectionHeading}>Pay split</span>
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

                <div className={`${styles.form} ${styles.detailDivider}`}>
                  <div>
                    <span className={styles.sectionHeading}>Customers covered</span>
                    <p className={styles.formHint}>Routes for these accounts come to this driver first</p>
                  </div>
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
              </div>
            </div>
          </Card>
        )}
      </div>
    </OperatorRoute>
  );
}
