'use client';

import { useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import OperatorRoute from '@/app/components/OperatorRoute';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import PageHeader from '@/app/administrator/components/PageHeader';
import { createInvoice, createLineItem, updateCustomer } from '@/lib/queries';
import InvoiceCreateForm from '@/app/administrator/invoices/components/InvoiceCreateForm';
import InvoicePreview from '@/app/administrator/invoices/components/InvoicePreview';
import { useInvoiceBillingSettings } from '@/app/administrator/invoices/hooks/useInvoiceBillingSettings';
import { useInvoiceCreateState } from '@/app/administrator/invoices/hooks/useInvoiceCreateState';
import { useInvoiceDerivedFormEffects } from '@/app/administrator/invoices/hooks/useInvoiceDerivedFormEffects';
import { useCustomerRateLines } from '@/app/administrator/invoices/hooks/useCustomerRateLines';
import { useRateLineTotals } from '@/app/administrator/invoices/hooks/useRateLineTotals';
import { useRouteStopsPreview } from '@/app/administrator/invoices/hooks/useRouteStopsPreview';
import { useInvoiceUiState } from '@/app/administrator/invoices/hooks/useInvoiceUiState';
import { useInvoicesDataState } from '@/app/administrator/invoices/hooks/useInvoicesDataState';
import { buildLineItemInputs } from '@/app/administrator/invoices/rateLineHelpers';
import styles from '../page.module.css';

export default function GenerateInvoicePage() {
  const router = useRouter();

  const {
    saving,
    setSaving,
    error,
    setError,
    setLoading,
  } = useInvoiceUiState();

  const {
    customerId,
    setCustomerId,
    routeId,
    invoiceNumber,
    setInvoiceNumber,
    invoiceNumberOverridden,
    totalHours,
    setTotalHours,
    totalAmountOverridden,
    setTotalAmount,
    totalAmount,
    gstAmount,
    setGstAmount,
    rateLineQuantities,
    handleCustomerChange,
    handleRouteChange,
    handleInvoiceNumberChange,
    handleTotalAmountChange,
    handleRateLineQuantityChange,
  } = useInvoiceCreateState();

  const { rateLines } = useCustomerRateLines(customerId);

  const {
    customers,
    routes,
    invoices,
    fetchData,
    updateCustomerInState,
  } = useInvoicesDataState({ customerId, setCustomerId, setError, setLoading });

  const selectedCustomer = customers.find((entry) => entry.id === customerId);
  const selectedRoute = routes.find((route) => route.id === routeId);
  const { stops: previewStops, loading: previewStopsLoading } = useRouteStopsPreview(routeId);

  const handleToggleGroupByAgent = async (nextValue: boolean) => {
    if (!customerId) return;
    const previousValue = selectedCustomer?.groupLineItemsByAgent ?? false;
    updateCustomerInState(customerId, { groupLineItemsByAgent: nextValue });
    const result = await updateCustomer(customerId, { groupLineItemsByAgent: nextValue });
    if (result.errors && result.errors.length > 0) {
      updateCustomerInState(customerId, { groupLineItemsByAgent: previousValue });
      setError('Failed to update the on-charging grouping setting.');
    }
  };

  const {
    billingCompanyName,
    billingAbn,
    billingPhone,
    billingCompanyAddress,
    billingPaymentAccountName,
    billingBsb,
    billingAccountNumber,
  } = useInvoiceBillingSettings();

  const customerRoutes = routes.filter((r) => r.customerId === customerId);

  useEffect(() => { void fetchData(); }, [fetchData]);

  useInvoiceDerivedFormEffects({
    invoices,
    invoiceNumberOverridden,
    setInvoiceNumber,
    routeId,
    routes,
    customers,
    totalAmountOverridden,
    setTotalHours,
    setTotalAmount,
    setGstAmount,
    totalHours,
    hasRateLines: rateLines.length > 0,
  });

  useRateLineTotals({
    rateLines,
    quantities: rateLineQuantities,
    customer: selectedCustomer,
    totalAmountOverridden,
    setTotalAmount,
    setGstAmount,
  });

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!customerId) { setError('Select a customer first.'); return; }
    if (!routeId) { setError('Select a linked route before creating an invoice.'); return; }
    if (!Number(totalAmount)) { setError('Total amount must be greater than zero.'); return; }
    setSaving(true);
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    const result = await createInvoice({
      customerId,
      routeId: routeId || undefined,
      invoiceNumber: invoiceNumber.trim(),
      invoiceDate: today,
      totalAmount: Number(totalAmount),
      gstAmount: Number(gstAmount) || undefined,
      status: 'draft',
    });
    if (result.errors && result.errors.length > 0) {
      setError('Failed to create invoice.');
      setSaving(false);
      return;
    }

    const newInvoiceId = (result.data as { id?: string } | null)?.id;
    if (newInvoiceId && rateLines.length > 0) {
      const lineItemInputs = buildLineItemInputs({
        rateLines,
        quantities: rateLineQuantities,
        invoiceId: newInvoiceId,
        customerId,
        routeId: routeId || undefined,
        viewerSubs: selectedCustomer?.viewerSubs || [],
      });
      await Promise.all(lineItemInputs.map((input) => createLineItem(input)));
    }

    setSaving(false);
    router.push('/administrator/invoices');
  };

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.page}>
        <Breadcrumbs
          items={[
            { label: 'Invoices', href: '/administrator/invoices' },
            { label: 'Generate invoice' },
          ]}
        />
        <PageHeader title="Generate invoice" subtitle="Build an invoice from a finalised route and send it to the customer." />

        <InvoiceCreateForm
          customerId={customerId}
          routeId={routeId}
          invoiceNumber={invoiceNumber}
          totalHours={totalHours}
          totalAmount={totalAmount}
          gstAmount={gstAmount}
          saving={saving}
          customers={customers}
          customerRoutes={customerRoutes}
          rateLines={rateLines}
          rateLineQuantities={rateLineQuantities}
          onCustomerChange={handleCustomerChange}
          onRouteChange={handleRouteChange}
          onInvoiceNumberChange={handleInvoiceNumberChange}
          onTotalHoursChange={setTotalHours}
          onTotalAmountChange={handleTotalAmountChange}
          onRateLineQuantityChange={handleRateLineQuantityChange}
          onSubmit={handleCreate}
        />

        {error && <div className={styles.errorBanner} role="alert" aria-live="assertive">{error}</div>}

        {selectedCustomer && (
          <InvoicePreview
            invoiceNumber={invoiceNumber}
            customer={selectedCustomer}
            route={selectedRoute}
            rateLines={rateLines}
            rateLineQuantities={rateLineQuantities}
            totalHours={totalHours}
            totalAmount={totalAmount}
            gstAmount={gstAmount}
            stops={previewStops}
            stopsLoading={previewStopsLoading}
            billingCompanyName={billingCompanyName}
            billingAbn={billingAbn}
            billingPhone={billingPhone}
            billingCompanyAddress={billingCompanyAddress}
            billingPaymentAccountName={billingPaymentAccountName}
            billingBsb={billingBsb}
            billingAccountNumber={billingAccountNumber}
            onToggleGroupByAgent={(next) => {
              void handleToggleGroupByAgent(next);
            }}
          />
        )}
      </div>
    </OperatorRoute>
  );
}
