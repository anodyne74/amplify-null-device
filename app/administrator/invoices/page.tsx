'use client';

import { FormEvent, useEffect, useRef } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import OperatorRoute from '@/app/components/OperatorRoute';
import PageHeader from '@/app/administrator/components/PageHeader';
import {
  createInvoice,
  createLineItem,
  deleteInvoice,
  updateInvoice,
} from '@/lib/queries';
import InvoiceCreateForm from '@/app/administrator/invoices/components/InvoiceCreateForm';
import { useInvoiceBillingSettings } from '@/app/administrator/invoices/hooks/useInvoiceBillingSettings';
import InvoiceListTable from '@/app/administrator/invoices/components/InvoiceListTable';
import { useInvoiceCreateState } from '@/app/administrator/invoices/hooks/useInvoiceCreateState';
import { useInvoiceDerivedFormEffects } from '@/app/administrator/invoices/hooks/useInvoiceDerivedFormEffects';
import { useCustomerRateLines } from '@/app/administrator/invoices/hooks/useCustomerRateLines';
import { useRateLineTotals } from '@/app/administrator/invoices/hooks/useRateLineTotals';
import { useInvoiceDocumentActions } from '@/app/administrator/invoices/hooks/useInvoiceDocumentActions';
import { useInvoiceUiState } from '@/app/administrator/invoices/hooks/useInvoiceUiState';
import { useInvoicesDataState } from '@/app/administrator/invoices/hooks/useInvoicesDataState';
import type { Invoice } from '@/app/administrator/invoices/types';
import { buildLineItemInputs } from '@/app/administrator/invoices/rateLineHelpers';
import styles from './page.module.css';

function normalizeInvoiceStatus(status?: Invoice['status'] | string | null) {
  return String(status ?? '').trim().toLowerCase();
}

function isInvoicePaid(status?: Invoice['status'] | string | null) {
  return normalizeInvoiceStatus(status) === 'paid';
}

export default function InvoicesAdminPage() {
  const { user } = useAuthenticator();
  const {
    loading,
    setLoading,
    saving,
    setSaving,
    error,
    setError,
    successMessage,
    setSuccessMessage,
    uploadingId,
    setUploadingId,
    uploadError,
    setUploadError,
    pdfActionLoadingId,
    setPdfActionLoadingId,
    emailingInvoiceId,
    setEmailingInvoiceId,
    setPendingUploadInvoiceId,
    pendingUploadInvoiceIdRef,
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
    resetAfterCreate,
  } = useInvoiceCreateState();

  const { rateLines } = useCustomerRateLines(customerId);

  const {
    customers,
    routes,
    invoices,
    sortedInvoices,
    fetchData,
    updateInvoiceInState,
    removeInvoiceFromState,
  } = useInvoicesDataState({ customerId, setCustomerId, setError, setLoading });

  const selectedCustomer = customers.find((entry) => entry.id === customerId);

  const {
    billingCompanyName,
    billingAbn,
    billingPhone,
    billingCompanyAddress,
    billingPaymentAccountName,
    billingBsb,
    billingAccountNumber,
  } = useInvoiceBillingSettings({ userId: user?.userId });

  // PDF upload state (per invoice)
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    handleUploadClick,
    handleFileChange,
    handlePdfAction,
    handleGeneratePdf,
    handleEmailInvoiceToPrimary,
  } = useInvoiceDocumentActions({
    customers,
    routes,
    invoices,
    fileInputRef,
    pendingUploadInvoiceIdRef,
    setPendingUploadInvoiceId,
    setUploadingId,
    setUploadError,
    setSuccessMessage,
    setPdfActionLoadingId,
    setEmailingInvoiceId,
    setError,
    updateInvoiceInState,
    billingCompanyName,
    billingAbn,
    billingPhone,
    billingCompanyAddress,
    billingPaymentAccountName,
    billingBsb,
    billingAccountNumber,
  });

  // Routes filtered by selected customer
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
    setSuccessMessage(null);
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

    resetAfterCreate();
    setSuccessMessage('Invoice created successfully.');
    await fetchData();
    setSaving(false);
  };

  const handleRouteLink = async (invoiceId: string, newRouteId: string) => {
    const result = await updateInvoice(invoiceId, { routeId: newRouteId || null });
    if (result.errors && result.errors.length > 0) {
      setError('Failed to update linked route.');
      return;
    }

    updateInvoiceInState(invoiceId, { routeId: newRouteId || null });
  };

  // Shared per-invoice mark-paid mutation (single row + bulk action).
  const markInvoicePaid = async (invoiceId: string): Promise<boolean> => {
    const result = await updateInvoice(invoiceId, { status: 'paid' });
    if (result.errors && result.errors.length > 0) return false;
    updateInvoiceInState(invoiceId, { status: 'paid' });
    return true;
  };

  const handleMarkPaid = async (invoiceId: string) => {
    const ok = await markInvoicePaid(invoiceId);
    if (!ok) setError('Failed to update status.');
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    const result = await deleteInvoice(invoiceId);
    if (result.errors && result.errors.length > 0) {
      setError('Failed to delete invoice.');
      return;
    }
    removeInvoiceFromState(invoiceId);
    setSuccessMessage('Invoice deleted.');
  };

  // Customer name lookup
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? id.slice(0, 8);
  const routeCode = (id?: string | null) => {
    if (!id) return '—';
    const r = routes.find((r) => r.id === id);
    return r?.routeCode ?? id.slice(0, 8);
  };

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.page}>
        <PageHeader title="Invoices" />

        {/* Hidden file input for PDF upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

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
        {successMessage && (
          <div className={styles.successBanner} role="status" aria-live="polite">
            <span>{successMessage}</span>
            <button
              type="button"
              className="nd-btn nd-btn--ghost nd-btn--sm"
              onClick={() => setSuccessMessage(null)}
              aria-label="Dismiss success message"
            >
              Dismiss
            </button>
          </div>
        )}
        {uploadError && <div className={styles.warningBanner} role="alert" aria-live="assertive">{uploadError}</div>}

        <InvoiceListTable
          loading={loading}
          invoices={sortedInvoices}
          routes={routes}
          uploadingId={uploadingId}
          pdfActionLoadingId={pdfActionLoadingId}
          emailingInvoiceId={emailingInvoiceId}
          customerName={customerName}
          routeCode={routeCode}
          isInvoicePaid={isInvoicePaid}
          onRouteLink={(invoiceId, newRouteId) => {
            void handleRouteLink(invoiceId, newRouteId);
          }}
          onGeneratePdf={(invoice) => {
            void handleGeneratePdf(invoice);
          }}
          onPdfAction={(invoice, action) => {
            void handlePdfAction(invoice, action);
          }}
          onUploadClick={handleUploadClick}
          onMarkPaid={(invoiceId) => {
            void handleMarkPaid(invoiceId);
          }}
          onDeleteInvoice={(invoiceId) => {
            void handleDeleteInvoice(invoiceId);
          }}
          onBulkMarkPaidInvoice={markInvoicePaid}
          onEmailInvoiceToPrimary={(invoice) => {
            void handleEmailInvoiceToPrimary(invoice);
          }}
        />
      </div>
    </OperatorRoute>
  );
}
