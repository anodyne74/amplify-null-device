'use client';

import { useEffect, useState } from 'react';
import OperatorRoute from '@/app/components/OperatorRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import PageHeader from '@/app/administrator/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Select } from '@/app/components/ui/forms/Select';
import { Switch } from '@/app/components/ui/forms/Switch';
import { StatTile } from '@/app/components/ui/data/StatTile';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';
import { listRateLines } from '@/lib/queries/ListRateLines';
import { createRateLine } from '@/lib/queries/CreateRateLine';
import { deleteRateLine } from '@/lib/queries/DeleteRateLine';
import { getCustomer, updateCustomer } from '@/lib/queries';
import { getOrganizationSettings, upsertOrganizationSettings } from '@/lib/queries/OrganizationSettings';
import { computeDriverSplit, type DriverSplitResult } from '@/lib/driverSplit';
import type { BillingCycle, Customer, RateLine, RateLineUnit } from '@/amplify/types';
import styles from './page.module.css';

const CYCLE_OPTIONS: { value: BillingCycle; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
];

const TERM_OPTIONS = [
  { value: '7', label: 'Net 7 days' },
  { value: '14', label: 'Net 14 days' },
  { value: '30', label: 'Net 30 days' },
];

const UNIT_OPTIONS: { value: RateLineUnit; label: string }[] = [
  { value: 'per_hour', label: 'per hour' },
  { value: 'per_stop', label: 'per stop' },
  { value: 'per_sign', label: 'per sign' },
];

function formatUnit(unit?: RateLineUnit | null) {
  return UNIT_OPTIONS.find((option) => option.value === unit)?.label ?? 'per hour';
}

function formatDate(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: start.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
}

export default function AdministratorPaymentDetailsPage() {
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingCustomer, setLoadingCustomer] = useState(false);

  const [payToCompanyName, setPayToCompanyName] = useState('');
  const [payToAbn, setPayToAbn] = useState('');
  const [payToPhone, setPayToPhone] = useState('');
  const [payToAddress, setPayToAddress] = useState('');
  const [payToAccountName, setPayToAccountName] = useState('');
  const [payToBsb, setPayToBsb] = useState('');
  const [payToAccountNumber, setPayToAccountNumber] = useState('');
  const [loadingPayTo, setLoadingPayTo] = useState(true);
  const [savingPayTo, setSavingPayTo] = useState(false);
  const [payToError, setPayToError] = useState<string | null>(null);
  const [payToSuccess, setPayToSuccess] = useState<string | null>(null);

  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [paymentTermsDays, setPaymentTermsDays] = useState('14');
  const [gstAbn, setGstAbn] = useState('');
  const [gstRegistered, setGstRegistered] = useState(false);
  const [gstExclusive, setGstExclusive] = useState(false);
  const [groupLineItemsByAgent, setGroupLineItemsByAgent] = useState(false);
  const [autoSendInvoiceOnPeriodClose, setAutoSendInvoiceOnPeriodClose] = useState(false);

  const [savingTax, setSavingTax] = useState(false);
  const [taxError, setTaxError] = useState<string | null>(null);
  const [taxSuccess, setTaxSuccess] = useState<string | null>(null);

  const [directDebitAccountName, setDirectDebitAccountName] = useState('');
  const [directDebitBsb, setDirectDebitBsb] = useState('');
  const [directDebitAccountNumber, setDirectDebitAccountNumber] = useState('');
  const [savingDirectDebit, setSavingDirectDebit] = useState(false);
  const [directDebitError, setDirectDebitError] = useState<string | null>(null);
  const [directDebitSuccess, setDirectDebitSuccess] = useState<string | null>(null);

  const [rateLines, setRateLines] = useState<RateLine[]>([]);
  const [loadingRateLines, setLoadingRateLines] = useState(false);
  const [rateLineError, setRateLineError] = useState<string | null>(null);
  const [newLineLabel, setNewLineLabel] = useState('');
  const [newLineUnit, setNewLineUnit] = useState<RateLineUnit>('per_hour');
  const [newLineRate, setNewLineRate] = useState('');
  const [addingLine, setAddingLine] = useState(false);
  const [removingLineId, setRemovingLineId] = useState<string | null>(null);
  const [copySourceId, setCopySourceId] = useState('');
  const [copyingLines, setCopyingLines] = useState(false);

  const [driverSplitPercent, setDriverSplitPercent] = useState('0');
  const [hideDriverSplitFromCustomer, setHideDriverSplitFromCustomer] = useState(false);
  const [paySplitOnCompletedStopsOnly, setPaySplitOnCompletedStopsOnly] = useState(false);
  const [savingDriverSplit, setSavingDriverSplit] = useState(false);
  const [driverSplitError, setDriverSplitError] = useState<string | null>(null);
  const [driverSplitSuccess, setDriverSplitSuccess] = useState<string | null>(null);

  const [splitPreview, setSplitPreview] = useState<DriverSplitResult | null>(null);
  const [loadingSplitPreview, setLoadingSplitPreview] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void listAllCustomers({ limit: 200 }).then((result) => {
      if (cancelled) return;
      const list = ((result.data as { id: string; name: string }[]) || []);
      setCustomers(list);
      if (list.length > 0) setSelectedCustomerId(list[0].id);
      setLoadingCustomers(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Switching customers swaps in a differently-sized panel below the page
    // header (rate card, stacked settings cards). Without resetting scroll,
    // picking a customer while scrolled down leaves the header/customer
    // picker off-screen for the newly loaded content.
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [selectedCustomerId]);

  useEffect(() => {
    // Org-wide, not customer-scoped -- loads once, independent of the customer picker above.
    let cancelled = false;

    void getOrganizationSettings().then((result) => {
      if (cancelled) return;
      const settings = result.data;
      setPayToCompanyName(settings?.companyName ?? '');
      setPayToAbn(settings?.abn ?? '');
      setPayToPhone(settings?.phone ?? '');
      setPayToAddress(settings?.address ?? '');
      setPayToAccountName(settings?.paymentAccountName ?? '');
      setPayToBsb(settings?.bsb ?? '');
      setPayToAccountNumber(settings?.accountNumber ?? '');
      setLoadingPayTo(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedCustomerId) return;
    let cancelled = false;
    setLoadingCustomer(true);

    void getCustomer(selectedCustomerId).then((result) => {
      if (cancelled) return;
      const nextCustomer = result.data as Customer | null;
      setCustomer(nextCustomer);
      setBillingCycle((nextCustomer?.billingCycle as BillingCycle | null) ?? 'monthly');
      setPaymentTermsDays(
        typeof nextCustomer?.paymentTermsDays === 'number' ? String(nextCustomer.paymentTermsDays) : '14'
      );
      setGstAbn(nextCustomer?.gstAbn ?? '');
      setGstRegistered(nextCustomer?.gstRegistered ?? false);
      setGstExclusive(nextCustomer?.gstExclusive ?? false);
      setGroupLineItemsByAgent(nextCustomer?.groupLineItemsByAgent ?? false);
      setAutoSendInvoiceOnPeriodClose(nextCustomer?.autoSendInvoiceOnPeriodClose ?? false);
      setDirectDebitAccountName(nextCustomer?.directDebitAccountName ?? '');
      setDirectDebitBsb(nextCustomer?.directDebitBsb ?? '');
      setDirectDebitAccountNumber(nextCustomer?.directDebitAccountNumber ?? '');
      setDriverSplitPercent(
        typeof nextCustomer?.driverSplitPercent === 'number' ? String(nextCustomer.driverSplitPercent) : '0'
      );
      setHideDriverSplitFromCustomer(nextCustomer?.hideDriverSplitFromCustomer ?? false);
      setPaySplitOnCompletedStopsOnly(nextCustomer?.paySplitOnCompletedStopsOnly ?? false);
      setTaxError(null);
      setTaxSuccess(null);
      setDirectDebitError(null);
      setDirectDebitSuccess(null);
      setDriverSplitError(null);
      setDriverSplitSuccess(null);
      setLoadingCustomer(false);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedCustomerId]);

  useEffect(() => {
    if (!customer || !selectedCustomerId) {
      setSplitPreview(null);
      return;
    }
    let cancelled = false;
    setLoadingSplitPreview(true);

    const { start, end } = getCurrentMonthRange();
    void computeDriverSplit({
      customerId: selectedCustomerId,
      billingRatePerHour: customer.billingRatePerHour || 0,
      driverSplitPercent: customer.driverSplitPercent || 0,
      paySplitOnCompletedStopsOnly: customer.paySplitOnCompletedStopsOnly ?? false,
      periodStartDate: start,
      periodEndDate: end,
    }).then((result) => {
      if (cancelled) return;
      setSplitPreview(result);
      setLoadingSplitPreview(false);
    });

    return () => {
      cancelled = true;
    };
  }, [customer, selectedCustomerId]);

  const refetchRateLines = async () => {
    const result = await listRateLines(selectedCustomerId);
    setRateLines((result.data as RateLine[]) || []);
  };

  useEffect(() => {
    if (!selectedCustomerId) {
      setRateLines([]);
      return;
    }
    let cancelled = false;
    setLoadingRateLines(true);
    setRateLineError(null);

    void listRateLines(selectedCustomerId).then((result) => {
      if (cancelled) return;
      setRateLines((result.data as RateLine[]) || []);
      setLoadingRateLines(false);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedCustomerId]);

  const handleAddRateLine = async () => {
    if (!newLineLabel.trim() || !newLineRate.trim()) return;
    setAddingLine(true);
    setRateLineError(null);

    const result = await createRateLine({
      customerId: selectedCustomerId,
      label: newLineLabel.trim(),
      unit: newLineUnit,
      ratePerUnit: Number(newLineRate),
      sortOrder: rateLines.length,
    });

    if (result.errors && result.errors.length > 0) {
      setRateLineError('Could not add rate line.');
      setAddingLine(false);
      return;
    }

    setNewLineLabel('');
    setNewLineRate('');
    await refetchRateLines();
    setAddingLine(false);
  };

  const handleDeleteRateLine = async (id: string) => {
    setRemovingLineId(id);
    setRateLineError(null);

    const result = await deleteRateLine(id);
    if (result.errors && result.errors.length > 0) {
      setRateLineError('Could not remove rate line.');
      setRemovingLineId(null);
      return;
    }

    await refetchRateLines();
    setRemovingLineId(null);
  };

  const handleCopyRateLines = async () => {
    if (!copySourceId) return;
    setCopyingLines(true);
    setRateLineError(null);

    const source = await listRateLines(copySourceId);
    const sourceLines = (source.data as RateLine[]) || [];

    if (sourceLines.length === 0) {
      setRateLineError('That customer has no rate lines to copy.');
      setCopyingLines(false);
      return;
    }

    const results = await Promise.all(
      sourceLines.map((line, index) =>
        createRateLine({
          customerId: selectedCustomerId,
          label: line.label,
          unit: line.unit || undefined,
          ratePerUnit: line.ratePerUnit,
          sortOrder: rateLines.length + index,
        })
      )
    );

    if (results.some((result) => result.errors && result.errors.length > 0)) {
      setRateLineError('Some rate lines could not be copied.');
    }

    await refetchRateLines();
    setCopyingLines(false);
  };

  const handleSavePayTo = async () => {
    setSavingPayTo(true);
    setPayToError(null);
    setPayToSuccess(null);

    const result = await upsertOrganizationSettings({
      companyName: payToCompanyName.trim(),
      abn: payToAbn.trim(),
      phone: payToPhone.trim(),
      address: payToAddress.trim(),
      paymentAccountName: payToAccountName.trim(),
      bsb: payToBsb.trim(),
      accountNumber: payToAccountNumber.trim(),
    });

    if (result.errors && result.errors.length > 0) {
      setPayToError('Could not save pay-to details.');
      setSavingPayTo(false);
      return;
    }

    setPayToSuccess('Pay-to details saved.');
    setSavingPayTo(false);
  };

  const handleSaveTax = async () => {
    setSavingTax(true);
    setTaxError(null);
    setTaxSuccess(null);

    const parsedTerms = Number(paymentTermsDays);
    const result = await updateCustomer(selectedCustomerId, {
      billingCycle,
      paymentTermsDays: Number.isFinite(parsedTerms) ? parsedTerms : undefined,
      gstAbn: gstAbn.trim(),
      gstRegistered,
      gstExclusive,
      groupLineItemsByAgent,
      autoSendInvoiceOnPeriodClose,
    });

    if (result.errors && result.errors.length > 0) {
      setTaxError('Could not save billing cycle & tax settings.');
      setSavingTax(false);
      return;
    }

    setTaxSuccess('Billing cycle & tax settings saved.');
    setSavingTax(false);
  };

  const handleSaveDirectDebit = async () => {
    setSavingDirectDebit(true);
    setDirectDebitError(null);
    setDirectDebitSuccess(null);

    const result = await updateCustomer(selectedCustomerId, {
      directDebitAccountName: directDebitAccountName.trim(),
      directDebitBsb: directDebitBsb.trim(),
      directDebitAccountNumber: directDebitAccountNumber.trim(),
      directDebitAuthorizedAt: new Date().toISOString(),
    });

    if (result.errors && result.errors.length > 0) {
      setDirectDebitError('Could not save direct debit details.');
      setSavingDirectDebit(false);
      return;
    }

    const refreshed = await getCustomer(selectedCustomerId);
    const nextCustomer = refreshed.data as Customer | null;
    if (nextCustomer) setCustomer(nextCustomer);

    setDirectDebitSuccess('Direct debit details saved.');
    setSavingDirectDebit(false);
  };

  const handleSaveDriverSplit = async () => {
    setSavingDriverSplit(true);
    setDriverSplitError(null);
    setDriverSplitSuccess(null);

    const parsedPercent = Number(driverSplitPercent);
    const result = await updateCustomer(selectedCustomerId, {
      driverSplitPercent: Number.isFinite(parsedPercent) ? parsedPercent : 0,
      driverSplitBasis: 'percentage_of_line_rate',
      hideDriverSplitFromCustomer,
      paySplitOnCompletedStopsOnly,
    });

    if (result.errors && result.errors.length > 0) {
      setDriverSplitError('Could not save driver split settings.');
      setSavingDriverSplit(false);
      return;
    }

    const refreshed = await getCustomer(selectedCustomerId);
    const nextCustomer = refreshed.data as Customer | null;
    if (nextCustomer) setCustomer(nextCustomer);

    setDriverSplitSuccess('Driver split settings saved.');
    setSavingDriverSplit(false);
  };

  const mandateSignedLabel = formatDate(customer?.directDebitAuthorizedAt);

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.page}>
        <PageHeader
          title="Payment Details"
          subtitle="Rate card, cycle, tax and direct debit"
          actions={
            <div className={styles.customerPicker}>
              <Field label="Customer" htmlFor="payment-details-customer">
                <Select
                  id="payment-details-customer"
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  disabled={loadingCustomers || customers.length === 0}
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          }
        />

        <Card title="Pay to" subtitle="Null Device's own remittance details, printed on every customer invoice">
          <div className={styles.form}>
            {payToError && <p className="nd-badge nd-badge--danger">{payToError}</p>}
            {payToSuccess && <p className="nd-badge nd-badge--success">{payToSuccess}</p>}

            {loadingPayTo ? (
              <p className={styles.rateCardEmpty}>Loading pay-to details…</p>
            ) : (
              <>
                <div className={styles.grid}>
                  <Field label="Company name" htmlFor="pd-payto-company-name">
                    <Input
                      id="pd-payto-company-name"
                      value={payToCompanyName}
                      onChange={(e) => setPayToCompanyName(e.target.value)}
                      disabled={savingPayTo}
                    />
                  </Field>
                  <Field label="ABN" htmlFor="pd-payto-abn">
                    <Input
                      id="pd-payto-abn"
                      value={payToAbn}
                      onChange={(e) => setPayToAbn(e.target.value)}
                      disabled={savingPayTo}
                    />
                  </Field>
                </div>

                <div className={styles.grid}>
                  <Field label="Phone" htmlFor="pd-payto-phone">
                    <Input
                      id="pd-payto-phone"
                      value={payToPhone}
                      onChange={(e) => setPayToPhone(e.target.value)}
                      disabled={savingPayTo}
                    />
                  </Field>
                  <Field label="Address" htmlFor="pd-payto-address">
                    <Input
                      id="pd-payto-address"
                      value={payToAddress}
                      onChange={(e) => setPayToAddress(e.target.value)}
                      disabled={savingPayTo}
                    />
                  </Field>
                </div>

                <Field
                  label="Pay-To Account Name"
                  htmlFor="pd-payto-account-name"
                  hint="Shown in the &quot;Pay to&quot; section of customer invoices — this is Null Device's own account, not the customer's."
                >
                  <Input
                    id="pd-payto-account-name"
                    value={payToAccountName}
                    onChange={(e) => setPayToAccountName(e.target.value)}
                    disabled={savingPayTo}
                  />
                </Field>

                <div className={styles.grid}>
                  <Field label="Pay-To BSB" htmlFor="pd-payto-bsb">
                    <Input
                      id="pd-payto-bsb"
                      value={payToBsb}
                      onChange={(e) => setPayToBsb(e.target.value)}
                      disabled={savingPayTo}
                    />
                  </Field>
                  <Field label="Pay-To Account Number" htmlFor="pd-payto-account-number">
                    <Input
                      id="pd-payto-account-number"
                      value={payToAccountNumber}
                      onChange={(e) => setPayToAccountNumber(e.target.value)}
                      disabled={savingPayTo}
                    />
                  </Field>
                </div>

                <div className={styles.actions}>
                  <Button type="button" loading={savingPayTo} disabled={savingPayTo} onClick={() => void handleSavePayTo()}>
                    {savingPayTo ? 'Saving…' : 'Save pay-to details'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>

        {loadingCustomers ? (
          <LoadingSpinner message="Loading customers..." />
        ) : customers.length === 0 ? (
          <p className={styles.emptyState}>No customers found.</p>
        ) : loadingCustomer ? (
          <LoadingSpinner message="Loading payment details..." />
        ) : (
          <div className={styles.layout}>
            <Card title="Rate card" subtitle={`${customer?.name ?? ''} · ex GST`} padded={false}>
              {rateLineError && <p className={`nd-badge nd-badge--danger ${styles.rateCardBanner}`}>{rateLineError}</p>}

              {loadingRateLines ? (
                <p className={styles.rateCardEmpty}>Loading rate lines…</p>
              ) : rateLines.length === 0 ? (
                <p className={styles.rateCardEmpty}>No rate lines yet — this customer uses the flat billing rate.</p>
              ) : (
                <div className={styles.rateCardTable}>
                  {rateLines.map((line) => (
                    <div key={line.id} className={styles.rateCardRow}>
                      <span className={styles.rateCardRowLabel}>{line.label}</span>
                      <span className={styles.rateCardRowUnit}>{formatUnit(line.unit)}</span>
                      <span className={styles.rateCardRowRate}>${line.ratePerUnit.toFixed(2)}</span>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        loading={removingLineId === line.id}
                        disabled={removingLineId === line.id}
                        onClick={() => void handleDeleteRateLine(line.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.rateCardAddRow}>
                <Field label="Label" htmlFor="rl-label">
                  <Input
                    id="rl-label"
                    value={newLineLabel}
                    onChange={(e) => setNewLineLabel(e.target.value)}
                    placeholder="Placement"
                    disabled={addingLine}
                  />
                </Field>
                <Field label="Unit" htmlFor="rl-unit">
                  <Select
                    id="rl-unit"
                    value={newLineUnit}
                    onChange={(e) => setNewLineUnit(e.target.value as RateLineUnit)}
                    disabled={addingLine}
                  >
                    {UNIT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Rate" htmlFor="rl-rate">
                  <Input
                    id="rl-rate"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newLineRate}
                    onChange={(e) => setNewLineRate(e.target.value)}
                    placeholder="30.00"
                    disabled={addingLine}
                  />
                </Field>
                <Button
                  type="button"
                  size="sm"
                  iconLeft="plus"
                  loading={addingLine}
                  disabled={addingLine || !newLineLabel.trim() || !newLineRate.trim()}
                  onClick={() => void handleAddRateLine()}
                >
                  Add rate line
                </Button>
              </div>

              <div className={styles.rateCardCopyRow}>
                <Field label="Copy from another customer" htmlFor="rl-copy-source">
                  <Select
                    id="rl-copy-source"
                    value={copySourceId}
                    onChange={(e) => setCopySourceId(e.target.value)}
                    disabled={copyingLines}
                  >
                    <option value="">Select a customer…</option>
                    {customers.filter((c) => c.id !== selectedCustomerId).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  loading={copyingLines}
                  disabled={copyingLines || !copySourceId}
                  onClick={() => void handleCopyRateLines()}
                >
                  Copy rate lines
                </Button>
              </div>
            </Card>

            <div className={styles.sidebar}>
            <Card title="Billing cycle & tax">
              <div className={styles.form}>
                {taxError && <p className="nd-badge nd-badge--danger">{taxError}</p>}
                {taxSuccess && <p className="nd-badge nd-badge--success">{taxSuccess}</p>}

                <div className={styles.grid}>
                  <Field label="Cycle" htmlFor="pd-cycle">
                    <Select
                      id="pd-cycle"
                      value={billingCycle}
                      onChange={(e) => setBillingCycle(e.target.value as BillingCycle)}
                      disabled={savingTax}
                    >
                      {CYCLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Payment terms" htmlFor="pd-terms">
                    <Select
                      id="pd-terms"
                      value={paymentTermsDays}
                      onChange={(e) => setPaymentTermsDays(e.target.value)}
                      disabled={savingTax}
                    >
                      {TERM_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <Field label="ABN" htmlFor="pd-abn">
                  <Input id="pd-abn" value={gstAbn} onChange={(e) => setGstAbn(e.target.value)} disabled={savingTax} />
                </Field>

                <Switch
                  checked={gstRegistered}
                  onChange={(e) => setGstRegistered(e.target.checked)}
                  label="Customer is GST registered"
                  disabled={savingTax}
                />
                <Switch
                  checked={gstExclusive}
                  onChange={(e) => setGstExclusive(e.target.checked)}
                  label="Rates are ex GST — add 10% on invoice"
                  disabled={savingTax}
                />
                <Switch
                  checked={groupLineItemsByAgent}
                  onChange={(e) => setGroupLineItemsByAgent(e.target.checked)}
                  label="Group line items by agent for on-charging"
                  disabled={savingTax}
                />
                <Switch
                  checked={autoSendInvoiceOnPeriodClose}
                  onChange={(e) => setAutoSendInvoiceOnPeriodClose(e.target.checked)}
                  label="Auto-send invoice when the period closes"
                  disabled={savingTax}
                />

                <div className={styles.actions}>
                  <Button type="button" loading={savingTax} disabled={savingTax} onClick={() => void handleSaveTax()}>
                    {savingTax ? 'Saving…' : 'Save billing cycle & tax'}
                  </Button>
                </div>
              </div>
            </Card>

            <Card title="Direct debit" subtitle="Debited two business days after the invoice date">
              <div className={styles.form}>
                {directDebitError && <p className="nd-badge nd-badge--danger">{directDebitError}</p>}
                {directDebitSuccess && <p className="nd-badge nd-badge--success">{directDebitSuccess}</p>}

                <Field label="Account name" htmlFor="pd-dd-name">
                  <Input
                    id="pd-dd-name"
                    value={directDebitAccountName}
                    onChange={(e) => setDirectDebitAccountName(e.target.value)}
                    disabled={savingDirectDebit}
                  />
                </Field>
                <div className={styles.grid}>
                  <Field label="BSB" htmlFor="pd-dd-bsb">
                    <Input
                      id="pd-dd-bsb"
                      value={directDebitBsb}
                      onChange={(e) => setDirectDebitBsb(e.target.value)}
                      disabled={savingDirectDebit}
                    />
                  </Field>
                  <Field label="Account number" htmlFor="pd-dd-account">
                    <Input
                      id="pd-dd-account"
                      value={directDebitAccountNumber}
                      onChange={(e) => setDirectDebitAccountNumber(e.target.value)}
                      disabled={savingDirectDebit}
                    />
                  </Field>
                </div>

                <div className={styles.actions}>
                  <Button
                    type="button"
                    loading={savingDirectDebit}
                    disabled={savingDirectDebit}
                    onClick={() => void handleSaveDirectDebit()}
                  >
                    {savingDirectDebit ? 'Saving…' : 'Save payment details'}
                  </Button>
                  {mandateSignedLabel && <span className={styles.mandateNote}>Mandate signed {mandateSignedLabel}</span>}
                </div>
              </div>
            </Card>

            <Card title="Driver split" subtitle="Share of this period's billed amount paid to the assigned operator">
              <div className={styles.form}>
                {driverSplitError && <p className="nd-badge nd-badge--danger">{driverSplitError}</p>}
                {driverSplitSuccess && <p className="nd-badge nd-badge--success">{driverSplitSuccess}</p>}

                <Field label="Split %" htmlFor="pd-split-percent">
                  <Input
                    id="pd-split-percent"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={driverSplitPercent}
                    onChange={(e) => setDriverSplitPercent(e.target.value)}
                    disabled={savingDriverSplit}
                  />
                </Field>

                <Switch
                  checked={paySplitOnCompletedStopsOnly}
                  onChange={(e) => setPaySplitOnCompletedStopsOnly(e.target.checked)}
                  label="Only pay split on fully completed stops"
                  disabled={savingDriverSplit}
                />
                <Switch
                  checked={hideDriverSplitFromCustomer}
                  onChange={(e) => setHideDriverSplitFromCustomer(e.target.checked)}
                  label="Hide driver split from customer-facing documents"
                  disabled={savingDriverSplit}
                />

                <div className={styles.actions}>
                  <Button
                    type="button"
                    loading={savingDriverSplit}
                    disabled={savingDriverSplit}
                    onClick={() => void handleSaveDriverSplit()}
                  >
                    {savingDriverSplit ? 'Saving…' : 'Save driver split'}
                  </Button>
                </div>

                {loadingSplitPreview ? (
                  <p className={styles.rateCardEmpty}>Calculating this period…</p>
                ) : splitPreview ? (
                  <div className={styles.splitStats}>
                    <StatTile
                      label="Driver share (this period)"
                      value={`$${splitPreview.totalDriverShare.toFixed(2)}`}
                      caption={`across ${splitPreview.totalStopCount} stop${splitPreview.totalStopCount === 1 ? '' : 's'}`}
                    />
                    <StatTile
                      label="Retained"
                      value={`$${splitPreview.retained.toFixed(2)}`}
                      caption={
                        splitPreview.totalBilled > 0
                          ? `${((splitPreview.retained / splitPreview.totalBilled) * 100).toFixed(1)}% of $${splitPreview.totalBilled.toFixed(2)} billed`
                          : 'No billed activity this period'
                      }
                    />
                  </div>
                ) : null}
              </div>
            </Card>
            </div>
          </div>
        )}
      </div>
    </OperatorRoute>
  );
}
