'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import OperatorRoute from '@/app/components/OperatorRoute';
import PageHeader from '@/app/administrator/components/PageHeader';
import { deleteInvoice, updateInvoice } from '@/lib/queries';
import InvoiceListTable from '@/app/administrator/invoices/components/InvoiceListTable';
import UninvoicedRoutesTable from '@/app/administrator/invoices/components/UninvoicedRoutesTable';
import { useInvoiceDocumentActions } from '@/app/administrator/invoices/hooks/useInvoiceDocumentActions';
import { useInvoiceBillingSettings } from '@/app/administrator/invoices/hooks/useInvoiceBillingSettings';
import { useInvoiceUiState } from '@/app/administrator/invoices/hooks/useInvoiceUiState';
import { useInvoicesDataState } from '@/app/administrator/invoices/hooks/useInvoicesDataState';
import type { Invoice } from '@/app/administrator/invoices/types';
import styles from './page.module.css';

function normalizeInvoiceStatus(status?: Invoice['status'] | string | null) {
  return String(status ?? '').trim().toLowerCase();
}

function isInvoicePaid(status?: Invoice['status'] | string | null) {
  return normalizeInvoiceStatus(status) === 'paid';
}

export default function InvoicesAdminPage() {
  const {
    loading,
    setLoading,
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

  const [customerId, setCustomerId] = useState('');

  const {
    customers,
    routes,
    invoices,
    sortedInvoices,
    fetchData,
    updateInvoiceInState,
    removeInvoiceFromState,
  } = useInvoicesDataState({ customerId, setCustomerId, setError, setLoading });

  const {
    billingCompanyName,
    billingAbn,
    billingPhone,
    billingCompanyAddress,
    billingPaymentAccountName,
    billingBsb,
    billingAccountNumber,
  } = useInvoiceBillingSettings();

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

  useEffect(() => { void fetchData(); }, [fetchData]);

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

  const uninvoicedCompletedRoutes = routes.filter(
    (route) => route.status === 'completed' && !invoices.some((invoice) => invoice.routeId === route.id)
  );

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.page}>
        <PageHeader
          title="Invoices"
          actions={
            <Link href="/administrator/invoices/generate" className="nd-btn nd-btn--primary nd-btn--md">
              Generate invoice
            </Link>
          }
        />

        {/* Hidden file input for PDF upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={handleFileChange}
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

        <UninvoicedRoutesTable
          loading={loading}
          routes={uninvoicedCompletedRoutes}
          customerName={customerName}
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
