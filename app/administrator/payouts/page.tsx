'use client';

import { useEffect, useState } from 'react';
import OperatorRoute from '@/app/components/OperatorRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import PageHeader from '@/app/administrator/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Badge } from '@/app/components/ui/core/Badge';
import { Tag } from '@/app/components/ui/core/Tag';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Select } from '@/app/components/ui/forms/Select';
import { DataTable, type DataColumn } from '@/app/components/ui/data/DataTable';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';
import { listOperatorPayouts } from '@/lib/queries/ListOperatorPayouts';
import { createOperatorPayout } from '@/lib/queries/CreateOperatorPayout';
import { updateOperatorPayout } from '@/lib/queries/UpdateOperatorPayout';
import { getCustomer } from '@/lib/queries';
import { computeDriverSplit, type DriverSplitResult } from '@/lib/driverSplit';
import type { Customer, OperatorPayout, OperatorPayoutStatus } from '@/amplify/types';
import styles from './page.module.css';

type StatusFilter = 'all' | OperatorPayoutStatus;

function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: start.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
}

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

function operatorLabel(operatorSub: string, operatorName?: string) {
  if (operatorSub === 'unassigned') return 'Unassigned';
  return operatorName || `Operator ${operatorSub.slice(0, 8)}`;
}

export default function AdministratorPayoutsPage() {
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [payouts, setPayouts] = useState<OperatorPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);

  const defaultRange = getCurrentMonthRange();
  const [createCustomerId, setCreateCustomerId] = useState('');
  const [periodStart, setPeriodStart] = useState(defaultRange.start);
  const [periodEnd, setPeriodEnd] = useState(defaultRange.end);
  const [preview, setPreview] = useState<DriverSplitResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [creatingPayouts, setCreatingPayouts] = useState(false);

  const fetchPayouts = async () => {
    const result = await listOperatorPayouts();
    setPayouts((result.data as OperatorPayout[]) || []);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([listAllCustomers({ limit: 200 }), listOperatorPayouts()]).then(([customerResult, payoutResult]) => {
      if (cancelled) return;
      const customerList = (customerResult.data as { id: string; name: string }[]) || [];
      setCustomers(customerList);
      if (customerList.length > 0) setCreateCustomerId(customerList[0].id);
      setPayouts((payoutResult.data as OperatorPayout[]) || []);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? id.slice(0, 8);

  const filteredPayouts = payouts.filter((p) => statusFilter === 'all' || p.status === statusFilter);

  const handlePreview = async () => {
    if (!createCustomerId) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreview(null);

    const customerResult = await getCustomer(createCustomerId);
    const customer = customerResult.data as Customer | null;
    if (!customer) {
      setPreviewError('Could not load that customer.');
      setPreviewLoading(false);
      return;
    }

    const result = await computeDriverSplit({
      customerId: createCustomerId,
      billingRatePerHour: customer.billingRatePerHour || 0,
      driverSplitPercent: customer.driverSplitPercent || 0,
      paySplitOnCompletedStopsOnly: customer.paySplitOnCompletedStopsOnly ?? false,
      periodStartDate: periodStart,
      periodEndDate: periodEnd,
    });

    if (result.byOperator.length === 0) {
      setPreviewError('No completed routes for that customer in this period.');
    }

    setPreview(result);
    setPreviewLoading(false);
  };

  const handleCreatePayouts = async () => {
    if (!preview) return;
    const payableOperators = preview.byOperator.filter((o) => o.driverShare > 0);
    if (payableOperators.length === 0) return;

    setCreatingPayouts(true);
    setPreviewError(null);

    const results = await Promise.all(
      payableOperators.map((o) =>
        createOperatorPayout({
          operatorSub: o.operatorSub,
          customerId: createCustomerId,
          periodStartDate: periodStart,
          periodEndDate: periodEnd,
          amount: o.driverShare,
          status: 'pending',
        })
      )
    );

    if (results.some((r) => r.errors && r.errors.length > 0)) {
      setPreviewError('Some payouts could not be created.');
    }

    await fetchPayouts();
    setPreview(null);
    setCreatingPayouts(false);
  };

  const handleMarkPaid = async (payoutId: string) => {
    setMarkingPaidId(payoutId);
    const result = await updateOperatorPayout(payoutId, { status: 'paid', paidAt: new Date().toISOString() });
    if (!result.errors || result.errors.length === 0) {
      setPayouts((prev) =>
        prev.map((p) => (p.id === payoutId ? { ...p, status: 'paid', paidAt: new Date().toISOString() } : p))
      );
    } else {
      setError('Could not mark payout as paid.');
    }
    setMarkingPaidId(null);
  };

  const columns: DataColumn<OperatorPayout>[] = [
    { key: 'customer', header: 'Customer', render: (row) => customerName(row.customerId) },
    { key: 'operator', header: 'Operator', render: (row) => operatorLabel(row.operatorSub) },
    {
      key: 'period',
      header: 'Period',
      render: (row) => (row.periodStartDate && row.periodEndDate ? `${row.periodStartDate} – ${row.periodEndDate}` : '—'),
    },
    { key: 'amount', header: 'Amount', numeric: true, render: (row) => formatMoney(row.amount) },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={row.status === 'paid' ? 'success' : 'warning'} dot>
          {row.status === 'paid' ? 'Paid' : 'Pending'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) =>
        row.status === 'pending' ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            loading={markingPaidId === row.id}
            disabled={markingPaidId === row.id}
            onClick={() => void handleMarkPaid(row.id)}
          >
            Mark paid
          </Button>
        ) : null,
    },
  ];

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.page}>
        <PageHeader title="Payouts" subtitle="Driver-split payouts by customer and operator" />

        {error && <div className={styles.errorBanner} role="alert" aria-live="assertive">{error}</div>}

        <Card title="Create payout" subtitle="Computes each operator's share for a customer's billing period">
          <div className={styles.createForm}>
            {previewError && <p className="nd-badge nd-badge--danger">{previewError}</p>}

            <div className={styles.createFormGrid}>
              <Field label="Customer" htmlFor="payout-customer">
                <Select
                  id="payout-customer"
                  value={createCustomerId}
                  onChange={(e) => {
                    setCreateCustomerId(e.target.value);
                    setPreview(null);
                  }}
                  disabled={customers.length === 0}
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Period start" htmlFor="payout-period-start">
                <Input
                  id="payout-period-start"
                  type="date"
                  value={periodStart}
                  onChange={(e) => {
                    setPeriodStart(e.target.value);
                    setPreview(null);
                  }}
                />
              </Field>
              <Field label="Period end" htmlFor="payout-period-end">
                <Input
                  id="payout-period-end"
                  type="date"
                  value={periodEnd}
                  onChange={(e) => {
                    setPeriodEnd(e.target.value);
                    setPreview(null);
                  }}
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                loading={previewLoading}
                disabled={previewLoading || !createCustomerId}
                onClick={() => void handlePreview()}
              >
                Preview split
              </Button>
            </div>

            {preview && preview.byOperator.length > 0 && (
              <div className={styles.previewTable}>
                {preview.byOperator.map((o) => (
                  <div key={o.operatorSub} className={styles.previewRow}>
                    <span className={styles.previewRowLabel}>{operatorLabel(o.operatorSub, o.operatorName)}</span>
                    <span className={styles.previewRowMeta}>{o.stopCount} stops · {formatMoney(o.billedAmount)} billed</span>
                    <span className={styles.previewRowAmount}>{formatMoney(o.driverShare)}</span>
                  </div>
                ))}
                <div className={styles.createActions}>
                  <Button type="button" loading={creatingPayouts} disabled={creatingPayouts} onClick={() => void handleCreatePayouts()}>
                    {creatingPayouts ? 'Creating…' : `Create ${preview.byOperator.filter((o) => o.driverShare > 0).length} payout(s)`}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        <div className={styles.filters}>
          <Tag selected={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All</Tag>
          <Tag selected={statusFilter === 'pending'} onClick={() => setStatusFilter('pending')}>Pending</Tag>
          <Tag selected={statusFilter === 'paid'} onClick={() => setStatusFilter('paid')}>Paid</Tag>
        </div>

        {loading ? (
          <LoadingSpinner message="Loading payouts..." />
        ) : (
          <DataTable columns={columns} rows={filteredPayouts} empty="No payouts yet." />
        )}
      </div>
    </OperatorRoute>
  );
}
