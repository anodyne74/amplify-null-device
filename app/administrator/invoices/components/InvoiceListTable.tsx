import { useEffect, useMemo, useState } from 'react';
import type { Route } from '@/amplify/types';
import AdminActionButton from '@/app/components/AdminActionButton';
import ConfirmDialog from '@/app/components/ConfirmDialog';
import AdminDataTable, { AdminSortableHeader, useAdminTableSort } from '@/app/components/AdminDataTable';
import AdminListState from '@/app/components/AdminListState';
import AdminPagination, { ADMIN_PAGE_SIZE, getPageSlice } from '@/app/components/AdminPagination';
import AdminRowMenu from '@/app/components/AdminRowMenu';
import AdminSectionHeader from '@/app/components/AdminSectionHeader';
import { useToast } from '@/app/components/ToastProvider';
import type { Invoice, InvoiceStatus } from '@/app/administrator/invoices/types';
import styles from '@/app/dashboard.module.css';
import invoiceStyles from '@/app/administrator/invoices/page.module.css';

type InvoiceSortKey = 'invoiceNumber' | 'customer' | 'totalAmount' | 'status' | 'sent';

interface InvoiceListTableProps {
  loading: boolean;
  invoices: Invoice[];
  routes: Route[];
  uploadingId: string | null;
  pdfActionLoadingId: string | null;
  emailingInvoiceId: string | null;
  customerName: (id: string) => string;
  routeCode: (id?: string | null) => string;
  isInvoicePaid: (status?: Invoice['status'] | string | null) => boolean;
  onRouteLink: (invoiceId: string, routeId: string) => void;
  onGeneratePdf: (invoice: Invoice) => void;
  onPdfAction: (invoice: Invoice, action: 'view' | 'download') => void;
  onUploadClick: (invoiceId: string) => void;
  onMarkPaid: (invoiceId: string) => void;
  onEmailInvoiceToPrimary: (invoice: Invoice) => void;
  /**
   * Per-invoice mark-paid mutation used by the bulk action; resolves true on
   * success. When provided, a selection column and bulk action bar render.
   */
  onBulkMarkPaidInvoice?: (invoiceId: string) => Promise<boolean>;
}

function toTitleCase(value?: string | null) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return 'Draft';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getStatusChipClass(status?: InvoiceStatus | string | null) {
  switch (String(status ?? '').toLowerCase()) {
    case 'paid':
      return invoiceStyles.statusChipPaid;
    case 'sent':
      return invoiceStyles.statusChipSent;
    default:
      return invoiceStyles.statusChipDraft;
  }
}

function inferInvoiceStatus(invoice: Invoice): InvoiceStatus {
  const normalized = String(invoice.status ?? '').trim().toLowerCase();
  if (normalized === 'paid') return 'paid';
  if (invoice.emailSentAt || normalized === 'sent') return 'sent';
  return 'draft';
}

export function formatLocalDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

function pluralizeInvoices(count: number) {
  return `${count} invoice${count === 1 ? '' : 's'}`;
}

type ConfirmAction =
  | { type: 'regenerate' | 'markPaid'; invoice: Invoice }
  | { type: 'bulkMarkPaid'; invoiceIds: string[] };

export default function InvoiceListTable({
  loading,
  invoices,
  routes,
  uploadingId,
  pdfActionLoadingId,
  emailingInvoiceId,
  customerName,
  routeCode,
  isInvoicePaid,
  onRouteLink,
  onGeneratePdf,
  onPdfAction,
  onUploadClick,
  onMarkPaid,
  onEmailInvoiceToPrimary,
  onBulkMarkPaidInvoice,
}: InvoiceListTableProps) {
  const { showToast } = useToast();
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const bulkSelectionEnabled = typeof onBulkMarkPaidInvoice === 'function';

  const { sortBy, sortDirection, toggleSort } = useAdminTableSort<InvoiceSortKey>();
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [sortBy, sortDirection, invoices.length]);

  const sortedInvoices = useMemo(() => {
    if (!sortBy) return invoices;
    const value = (invoice: Invoice): string | number => {
      switch (sortBy) {
        case 'invoiceNumber':
          return invoice.invoiceNumber ?? '';
        case 'customer':
          return customerName(invoice.customerId);
        case 'totalAmount':
          return invoice.totalAmount ?? 0;
        case 'status':
          return inferInvoiceStatus(invoice);
        case 'sent': {
          const parsed = Date.parse(invoice.emailSentAt ?? '');
          return Number.isFinite(parsed) ? parsed : 0;
        }
      }
    };
    const sorted = [...invoices].sort((a, b) => {
      const left = value(a);
      const right = value(b);
      if (typeof left === 'number' && typeof right === 'number') return left - right;
      return String(left).localeCompare(String(right), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    });
    if (sortDirection === 'desc') sorted.reverse();
    return sorted;
  }, [invoices, customerName, sortBy, sortDirection]);

  const { currentPage, pageRows: pageInvoices } = getPageSlice(sortedInvoices, page, ADMIN_PAGE_SIZE);

  // Selection is only meaningful for invoices that can still be marked paid.
  const selectedEligible = useMemo(
    () => invoices.filter((invoice) => selectedIds.has(invoice.id) && !isInvoicePaid(inferInvoiceStatus(invoice))),
    [invoices, selectedIds, isInvoicePaid]
  );
  const pageEligibleIds = pageInvoices
    .filter((invoice) => !isInvoicePaid(inferInvoiceStatus(invoice)))
    .map((invoice) => invoice.id);
  const allPageSelected =
    pageEligibleIds.length > 0 && pageEligibleIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageEligibleIds.some((id) => selectedIds.has(id));

  const toggleInvoiceSelected = (invoiceId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(invoiceId)) next.delete(invoiceId);
      else next.add(invoiceId);
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageEligibleIds.forEach((id) => next.delete(id));
      } else {
        pageEligibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleBulkMarkPaid = async (invoiceIds: string[]) => {
    if (!onBulkMarkPaidInvoice) return;
    setBulkBusy(true);
    let succeeded = 0;
    let failed = 0;
    for (const invoiceId of invoiceIds) {
      const ok = await onBulkMarkPaidInvoice(invoiceId);
      if (ok) succeeded += 1;
      else failed += 1;
    }
    if (failed === 0) {
      showToast(`Marked ${pluralizeInvoices(succeeded)} as paid.`, 'success');
    } else if (succeeded === 0) {
      showToast(`Failed to mark ${pluralizeInvoices(failed)} as paid.`, 'error');
    } else {
      showToast(
        `Marked ${pluralizeInvoices(succeeded)} as paid. ${failed} failed.`,
        'error'
      );
    }
    setSelectedIds(new Set());
    setBulkBusy(false);
    setConfirmAction(null);
  };

  const handleConfirm = () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'bulkMarkPaid') {
      void handleBulkMarkPaid(confirmAction.invoiceIds);
      return;
    }
    if (confirmAction.type === 'regenerate') {
      onGeneratePdf(confirmAction.invoice);
    } else {
      onMarkPaid(confirmAction.invoice.id);
    }
    setConfirmAction(null);
  };

  const confirmDialogContent = (() => {
    if (!confirmAction) return { title: '', message: '', confirmLabel: 'Confirm' };
    if (confirmAction.type === 'bulkMarkPaid') {
      const count = confirmAction.invoiceIds.length;
      return {
        title: 'Mark invoices as paid?',
        message: `Mark ${pluralizeInvoices(count)} as paid? This cannot be undone from this screen.`,
        confirmLabel: 'Mark Paid',
      };
    }
    if (confirmAction.type === 'markPaid') {
      return {
        title: 'Mark invoice as paid?',
        message: `Mark invoice ${confirmAction.invoice.invoiceNumber} as paid? This cannot be undone from this screen.`,
        confirmLabel: 'Mark Paid',
      };
    }
    return {
      title: 'Regenerate invoice PDF?',
      message: `Regenerate invoice ${confirmAction.invoice.invoiceNumber}? This will replace the attached PDF.`,
      confirmLabel: 'Regenerate',
    };
  })();

  return (
    <div className={`${styles.infoPanel} ${invoiceStyles.listPanel}`}>
      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmDialogContent.title}
        message={confirmDialogContent.message}
        confirmLabel={confirmDialogContent.confirmLabel}
        tone="danger"
        busy={bulkBusy}
        onConfirm={handleConfirm}
        onCancel={() => {
          if (!bulkBusy) setConfirmAction(null);
        }}
      />
      <AdminSectionHeader title="Invoice List" titleClassName={invoiceStyles.panelHeading} />
      {loading || invoices.length === 0 ? (
        <AdminListState
          loading={loading}
          empty={!loading && invoices.length === 0}
          loadingMessage="Loading invoices..."
          emptyMessage="No invoices yet."
        />
      ) : (
        <>
          {bulkSelectionEnabled && selectedEligible.length > 0 && (
            <div className={styles.bulkActionBar}>
              <p className={styles.bulkActionText}>
                {pluralizeInvoices(selectedEligible.length)} selected
              </p>
              <AdminActionButton
                variant="primary"
                isLoading={bulkBusy}
                loadingLabel="Marking paid..."
                onClick={() =>
                  setConfirmAction({
                    type: 'bulkMarkPaid',
                    invoiceIds: selectedEligible.map((invoice) => invoice.id),
                  })
                }
              >
                Mark {pluralizeInvoices(selectedEligible.length)} paid
              </AdminActionButton>
              <AdminActionButton
                variant="ghost"
                disabled={bulkBusy}
                onClick={() => setSelectedIds(new Set())}
              >
                Clear selection
              </AdminActionButton>
            </div>
          )}
          <AdminDataTable
            ariaLabel="Invoice list"
            wrapClassName={invoiceStyles.tableWrap}
            tableClassName={invoiceStyles.invoiceTable}
          >
            <thead>
              <tr>
                {bulkSelectionEnabled && (
                  <th scope="col" className={styles.selectCell}>
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      ref={(element) => {
                        if (element) element.indeterminate = !allPageSelected && somePageSelected;
                      }}
                      onChange={toggleSelectAllOnPage}
                      disabled={bulkBusy || pageEligibleIds.length === 0}
                      aria-label="Select all unpaid invoices on this page"
                    />
                  </th>
                )}
                <AdminSortableHeader
                  label="Invoice #"
                  sortKey="invoiceNumber"
                  sortBy={sortBy}
                  sortDirection={sortDirection}
                  onSort={toggleSort}
                />
                <AdminSortableHeader
                  label="Customer"
                  sortKey="customer"
                  sortBy={sortBy}
                  sortDirection={sortDirection}
                  onSort={toggleSort}
                />
                <th scope="col">Route</th>
                <AdminSortableHeader
                  label="Total"
                  sortKey="totalAmount"
                  sortBy={sortBy}
                  sortDirection={sortDirection}
                  onSort={toggleSort}
                />
                <AdminSortableHeader
                  label="Status"
                  sortKey="status"
                  sortBy={sortBy}
                  sortDirection={sortDirection}
                  onSort={toggleSort}
                />
                <AdminSortableHeader
                  label="Sent"
                  sortKey="sent"
                  sortBy={sortBy}
                  sortDirection={sortDirection}
                  onSort={toggleSort}
                />
                <th scope="col">PDF</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageInvoices.map((invoice) => (
                <tr key={invoice.id}>
                  {bulkSelectionEnabled && (
                    <td className={styles.selectCell}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(invoice.id)}
                        onChange={() => toggleInvoiceSelected(invoice.id)}
                        disabled={bulkBusy || isInvoicePaid(inferInvoiceStatus(invoice))}
                        aria-label={`Select invoice ${invoice.invoiceNumber}`}
                      />
                    </td>
                  )}
                  <td>
                    {invoice.invoiceNumber}
                    {invoice.importedAt && (
                      <span className={invoiceStyles.importedBadge}>Imported</span>
                    )}
                  </td>
                  <td>{customerName(invoice.customerId)}</td>
                  <td>
                    <select
                      value={invoice.routeId ?? ''}
                      onChange={(event) => onRouteLink(invoice.id, event.target.value)}
                      className={invoiceStyles.cellSelect}
                      aria-label={`Linked route for invoice ${invoice.invoiceNumber}`}
                    >
                      <option value="">— None —</option>
                      {routes
                        .filter((route) => route.customerId === invoice.customerId)
                        .map((route) => (
                          <option key={route.id} value={route.id}>
                            {routeCode(route.id)}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td className={invoiceStyles.cellNumeric}>${invoice.totalAmount.toFixed(2)}</td>
                  <td>
                    <span className={`${invoiceStyles.statusChip} ${getStatusChipClass(inferInvoiceStatus(invoice))}`}>
                      {toTitleCase(inferInvoiceStatus(invoice))}
                    </span>
                  </td>
                  <td>
                    {formatLocalDateTime(invoice.emailSentAt)}
                  </td>
                  <td className={invoiceStyles.pdfCell}>
                    {invoice.pdfS3Key ? (
                      <div className={invoiceStyles.uploadedState}>
                        <span className={`${invoiceStyles.statusChip} ${invoiceStyles.pdfChipAttached}`}>PDF Attached</span>
                        <AdminActionButton
                          className={invoiceStyles.inlineButton}
                          variant="ghost"
                          onClick={() => onPdfAction(invoice, 'view')}
                          isLoading={pdfActionLoadingId === invoice.id}
                          loadingLabel="Opening..."
                          disabled={uploadingId === invoice.id}
                          aria-label={`View PDF for invoice ${invoice.invoiceNumber}`}
                        >
                          View
                        </AdminActionButton>
                        <AdminRowMenu ariaLabel={`More PDF actions for invoice ${invoice.invoiceNumber}`}>
                          {!invoice.importedAt && (
                            <AdminActionButton
                              className={invoiceStyles.inlineButton}
                              variant="secondary"
                              onClick={() => setConfirmAction({ type: 'regenerate', invoice })}
                              isLoading={uploadingId === invoice.id}
                              loadingLabel="Generating..."
                              disabled={pdfActionLoadingId === invoice.id}
                              aria-label={`Regenerate PDF for invoice ${invoice.invoiceNumber}`}
                            >
                              Regenerate
                            </AdminActionButton>
                          )}
                          <AdminActionButton
                            className={invoiceStyles.inlineButton}
                            variant="ghost"
                            onClick={() => onPdfAction(invoice, 'download')}
                            isLoading={pdfActionLoadingId === invoice.id}
                            loadingLabel="Preparing..."
                            disabled={uploadingId === invoice.id}
                            aria-label={`Download PDF for invoice ${invoice.invoiceNumber}`}
                          >
                            Download
                          </AdminActionButton>
                          <AdminActionButton
                            className={invoiceStyles.inlineButton}
                            variant="secondary"
                            onClick={() => onUploadClick(invoice.id)}
                            disabled={uploadingId === invoice.id || pdfActionLoadingId === invoice.id}
                            aria-label={`Replace PDF for invoice ${invoice.invoiceNumber}`}
                          >
                            Replace
                          </AdminActionButton>
                        </AdminRowMenu>
                      </div>
                    ) : (
                      <div className={invoiceStyles.uploadedState}>
                        <span className={`${invoiceStyles.statusChip} ${invoiceStyles.pdfChipMissing}`}>PDF Missing</span>
                        {!invoice.importedAt && (
                          <AdminActionButton
                            className={invoiceStyles.uploadButton}
                            variant="primary"
                            onClick={() => onGeneratePdf(invoice)}
                            isLoading={uploadingId === invoice.id}
                            loadingLabel="Generating..."
                            aria-label={`Generate PDF for invoice ${invoice.invoiceNumber}`}
                          >
                            Generate PDF
                          </AdminActionButton>
                        )}
                        <AdminRowMenu ariaLabel={`More PDF actions for invoice ${invoice.invoiceNumber}`}>
                          <AdminActionButton
                            className={invoiceStyles.uploadButton}
                            variant="secondary"
                            onClick={() => onUploadClick(invoice.id)}
                            isLoading={uploadingId === invoice.id}
                            loadingLabel="Uploading..."
                            aria-label={`Upload PDF for invoice ${invoice.invoiceNumber}`}
                          >
                            Upload PDF
                          </AdminActionButton>
                        </AdminRowMenu>
                      </div>
                    )}
                  </td>
                  <td>
                    <div className={invoiceStyles.actionButtons}>
                      {!isInvoicePaid(inferInvoiceStatus(invoice)) && (
                        <AdminActionButton
                          className={invoiceStyles.markPaidButton}
                          variant="primary"
                          onClick={() => setConfirmAction({ type: 'markPaid', invoice })}
                          aria-label={`Mark invoice ${invoice.invoiceNumber} as paid`}
                        >
                          Mark Paid
                        </AdminActionButton>
                      )}
                      <AdminActionButton
                        className={invoiceStyles.emailButton}
                        variant="secondary"
                        onClick={() => onEmailInvoiceToPrimary(invoice)}
                        isLoading={emailingInvoiceId === invoice.id}
                        loadingLabel="Preparing..."
                        aria-label={`${invoice.emailSentAt ? 'Resend' : 'Email'} invoice ${invoice.invoiceNumber}`}
                      >
                        {invoice.emailSentAt ? 'Resend' : 'Email'}
                      </AdminActionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </AdminDataTable>
          <AdminPagination
            page={currentPage}
            totalItems={sortedInvoices.length}
            onPageChange={setPage}
            itemsLabel="invoices"
          />
        </>
      )}
    </div>
  );
}
