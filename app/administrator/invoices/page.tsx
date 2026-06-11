'use client';

import { FormEvent, useEffect, useRef } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import AdminFeedbackBanner from '@/app/components/AdminFeedbackBanner';
import OperatorRoute from '@/app/components/OperatorRoute';
import {
  createInvoice,
  updateInvoice,
} from '@/lib/queries';
import InvoiceCreateForm from '@/app/administrator/invoices/components/InvoiceCreateForm';
import { useInvoiceBillingSettings } from '@/app/administrator/invoices/hooks/useInvoiceBillingSettings';
import InvoiceListTable from '@/app/administrator/invoices/components/InvoiceListTable';
import { useInvoiceCreateState } from '@/app/administrator/invoices/hooks/useInvoiceCreateState';
import { useInvoiceDerivedFormEffects } from '@/app/administrator/invoices/hooks/useInvoiceDerivedFormEffects';
import { useInvoiceDocumentActions } from '@/app/administrator/invoices/hooks/useInvoiceDocumentActions';
import { useInvoiceUiState } from '@/app/administrator/invoices/hooks/useInvoiceUiState';
import { useInvoicesDataState } from '@/app/administrator/invoices/hooks/useInvoicesDataState';
import type { Invoice, InvoiceStatus } from '@/app/administrator/invoices/types';
import styles from '@/app/dashboard.module.css';
import invoiceStyles from '@/app/administrator/invoices/page.module.css';

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
    handleCustomerChange,
    handleRouteChange,
    handleInvoiceNumberChange,
    handleTotalAmountChange,
    resetAfterCreate,
  } = useInvoiceCreateState();

  const {
    customers,
    routes,
    invoices,
    sortedInvoices,
    fetchData,
    updateInvoiceInState,
  } = useInvoicesDataState({ customerId, setCustomerId, setError, setLoading });

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
    totalHours,
  });

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!customerId) { setError('Select a customer first.'); return; }
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
      status: 'draft',
    });
    if (result.errors && result.errors.length > 0) {
      setError('Failed to create invoice.');
    } else {
      resetAfterCreate();
      setSuccessMessage('Invoice created successfully.');
      await fetchData();
    }
    setSaving(false);
  };

  const setStatus = async (id: string, status: InvoiceStatus) => {
    const result = await updateInvoice(id, { status });
    if (result.errors && result.errors.length > 0) { setError('Failed to update status.'); return; }
    updateInvoiceInState(id, { status });
  };

  const handleRouteLink = async (invoiceId: string, newRouteId: string) => {
    const result = await updateInvoice(invoiceId, { routeId: newRouteId || null });
    if (result.errors && result.errors.length > 0) {
      setError('Failed to update linked route.');
      return;
    }

    updateInvoiceInState(invoiceId, { routeId: newRouteId || null });
  };

  const handleMarkPaid = async (invoiceId: string) => {
    await setStatus(invoiceId, 'paid');
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
        <h1 className={styles.heading}>Invoices</h1>

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
          saving={saving}
          customers={customers}
          customerRoutes={customerRoutes}
          onCustomerChange={handleCustomerChange}
          onRouteChange={handleRouteChange}
          onInvoiceNumberChange={handleInvoiceNumberChange}
          onTotalHoursChange={setTotalHours}
          onTotalAmountChange={handleTotalAmountChange}
          onSubmit={handleCreate}
        />

        <AdminFeedbackBanner
          message={error}
          tone="error"
          className={`${styles.infoPanel} ${invoiceStyles.alertPanel}`}
          messageClassName={invoiceStyles.errorText}
        />
        <AdminFeedbackBanner
          message={successMessage}
          tone="success"
          className={`${styles.infoPanel} ${invoiceStyles.alertPanel}`}
          contentClassName={invoiceStyles.successBanner}
          messageClassName={invoiceStyles.successText}
          dismissButtonClassName={invoiceStyles.dismissSuccessButton}
          dismissAriaLabel="Dismiss success message"
          onDismiss={() => setSuccessMessage(null)}
        />
        <AdminFeedbackBanner
          message={uploadError}
          tone="warning"
          className={`${styles.infoPanel} ${invoiceStyles.alertPanel}`}
          messageClassName={invoiceStyles.warningText}
        />

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
          onEmailInvoiceToPrimary={(invoice) => {
            void handleEmailInvoiceToPrimary(invoice);
          }}
        />
      </div>
    </OperatorRoute>
  );
}
