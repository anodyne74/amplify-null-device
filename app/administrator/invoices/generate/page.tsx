'use client';

import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import OperatorRoute from '@/app/components/OperatorRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import PageHeader from '@/app/administrator/components/PageHeader';
import { createInvoice, createLineItem } from '@/lib/queries';
import InvoiceCreateForm from '@/app/administrator/invoices/components/InvoiceCreateForm';
import InvoicePreview from '@/app/administrator/invoices/components/InvoicePreview';
import { useInvoiceBillingSettings } from '@/app/administrator/invoices/hooks/useInvoiceBillingSettings';
import { useInvoiceDraft } from '@/app/administrator/invoices/hooks/useInvoiceDraft';
import { useNextInvoiceNumber } from '@/app/administrator/invoices/hooks/useNextInvoiceNumber';
import { useRouteStopsPreview } from '@/app/administrator/invoices/hooks/useRouteStopsPreview';
import { useInvoiceUiState } from '@/app/administrator/invoices/hooks/useInvoiceUiState';
import { useInvoicesDataState } from '@/app/administrator/invoices/hooks/useInvoicesDataState';
import { buildLineItemInputs } from '@/app/administrator/invoices/rateLineHelpers';
import styles from '../page.module.css';
import { updateCustomer } from '@/lib/customers';

function GenerateInvoiceContent() {
  const router = useRouter();

  const {
    saving,
    setSaving,
    error,
    setError,
    setLoading,
  } = useInvoiceUiState();

  const [customerId, setCustomerId] = useState('');
  const [routeId, setRouteId] = useState('');

  // Pre-fill from the "Generate invoice" link on the unbilled-routes list
  // (/administrator/invoices/generate?routeId=...&customerId=...). Only runs
  // once so it doesn't fight with later manual selections.
  const searchParams = useSearchParams();
  const appliedParamsRef = useRef(false);

  const {
    customers,
    routes,
    invoices,
    fetchData,
    updateCustomerInState,
  } = useInvoicesDataState({ customerId, setCustomerId, setError, setLoading });

  const {
    selectedCustomer,
    selectedRoute,
    totalHours,
    setTotalHours,
    totalAmount,
    gstAmount,
    rateLines,
    selectCustomer,
    selectRoute,
    overrideTotal,
  } = useInvoiceDraft({ customerId, setCustomerId, routeId, setRouteId, customers, routes });

  const { invoiceNumber, setInvoiceNumber } = useNextInvoiceNumber(invoices);

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

  useEffect(() => {
    if (appliedParamsRef.current) return;
    const paramCustomerId = searchParams.get('customerId');
    const paramRouteId = searchParams.get('routeId');
    if (!paramCustomerId && !paramRouteId) return;
    appliedParamsRef.current = true;
    if (paramCustomerId) setCustomerId(paramCustomerId);
    if (paramRouteId) setRouteId(paramRouteId);
  }, [searchParams, setCustomerId, setRouteId]);

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
    if (newInvoiceId && rateLines.items.length > 0) {
      const lineItemInputs = buildLineItemInputs({
        rateLines: rateLines.items,
        quantities: rateLines.quantities,
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
          rateLines={rateLines.items}
          rateLineQuantities={rateLines.quantities}
          visibleRateLineIds={rateLines.visibleIds}
          onCustomerChange={selectCustomer}
          onRouteChange={selectRoute}
          onInvoiceNumberChange={setInvoiceNumber}
          onTotalHoursChange={setTotalHours}
          onTotalAmountChange={overrideTotal}
          onRateLineQuantityChange={rateLines.setQuantity}
          onAddRateLine={rateLines.add}
          onRemoveRateLine={rateLines.remove}
          onSubmit={handleCreate}
        />

        {error && <div className={styles.errorBanner} role="alert" aria-live="assertive">{error}</div>}

        {selectedCustomer && (
          <InvoicePreview
            invoiceNumber={invoiceNumber}
            customer={selectedCustomer}
            route={selectedRoute}
            rateLines={rateLines.items}
            rateLineQuantities={rateLines.quantities}
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
  );
}

export default function GenerateInvoicePage() {
  return (
    <OperatorRoute requireAdmin>
      <Suspense fallback={<LoadingSpinner message="Loading invoice form..." />}>
        <GenerateInvoiceContent />
      </Suspense>
    </OperatorRoute>
  );
}
