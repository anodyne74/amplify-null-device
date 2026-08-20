import { useEffect, useMemo, useState } from 'react';
import type { Route } from '@/amplify/types';
import ConfirmDialog from '@/app/components/ConfirmDialog';
import AdminRowMenu from '@/app/components/AdminRowMenu';
import { useAdminTableSort, type SortDirection } from '@/app/components/AdminDataTable';
import { ADMIN_PAGE_SIZE, getPageSlice } from '@/app/components/AdminPagination';
import { useToast } from '@/app/components/ToastProvider';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Badge, type BadgeProps } from '@/app/components/ui/core/Badge';
import { Select } from '@/app/components/ui/forms/Select';
import type { Invoice, InvoiceStatus } from '@/app/administrator/invoices/types';
import styles from '../page.module.css';

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

const STATUS_TONE: Record<string, BadgeProps['tone']> = {
  paid: 'success',
  sent: 'info',
  draft: 'neutral',
};

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

function SortableHeader({
  label,
  sortKey,
  sortBy,
  sortDirection,
  onSort,
}: {
  label: string;
  sortKey: InvoiceSortKey;
  sortBy: InvoiceSortKey | null;
  sortDirection: SortDirection;
  onSort: (key: InvoiceSortKey) => void;
}) {
  const active = sortBy === sortKey;
  const ariaSort = active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none';

  return (
    <th scope="col" aria-sort={ariaSort}>
      <button type="button" className={styles.sortButton} onClick={() => onSort(sortKey)} aria-label={`Sort by ${label}`}>
        <span>{label}</span>
        <span className={styles.sortIndicator} aria-hidden="true">
          {active ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

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

  const { currentPage, totalPages, pageRows: pageInvoices } = getPageSlice(sortedInvoices, page, ADMIN_PAGE_SIZE);

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
    <Card title="Invoice List" padded={loading || invoices.length === 0}>
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
      {loading || invoices.length === 0 ? (
        <p className={styles.mutedText}>{loading ? 'Loading invoices...' : 'No invoices yet.'}</p>
      ) : (
        <>
          {bulkSelectionEnabled && selectedEligible.length > 0 && (
            <div className={styles.bulkBar}>
              <p className={styles.bulkText}>
                {pluralizeInvoices(selectedEligible.length)} selected
              </p>
              <Button
                type="button"
                variant="primary"
                size="sm"
                loading={bulkBusy}
                onClick={() =>
                  setConfirmAction({
                    type: 'bulkMarkPaid',
                    invoiceIds: selectedEligible.map((invoice) => invoice.id),
                  })
                }
              >
                {bulkBusy ? 'Marking paid...' : `Mark ${pluralizeInvoices(selectedEligible.length)} paid`}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={bulkBusy}
                onClick={() => setSelectedIds(new Set())}
              >
                Clear selection
              </Button>
            </div>
          )}
          <div className={styles.tableWrap}>
            <table className="nd-table nd-table--hoverable" aria-label="Invoice list">
              <thead>
                <tr>
                  {bulkSelectionEnabled && (
                    <th scope="col">
                      <input
                        type="checkbox"
                        className={styles.checkbox}
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
                  <SortableHeader label="Invoice #" sortKey="invoiceNumber" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} />
                  <SortableHeader label="Customer" sortKey="customer" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} />
                  <th scope="col">Route</th>
                  <SortableHeader label="Total" sortKey="totalAmount" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} />
                  <SortableHeader label="Status" sortKey="status" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} />
                  <SortableHeader label="Sent" sortKey="sent" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} />
                  <th scope="col">PDF</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageInvoices.map((invoice) => (
                  <tr key={invoice.id}>
                    {bulkSelectionEnabled && (
                      <td>
                        <input
                          type="checkbox"
                          className={styles.checkbox}
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
                        <Badge tone="neutral" size="sm" className={styles.importedTag}>Imported</Badge>
                      )}
                    </td>
                    <td>{customerName(invoice.customerId)}</td>
                    <td>
                      <Select
                        value={invoice.routeId ?? ''}
                        onChange={(event) => onRouteLink(invoice.id, event.target.value)}
                        aria-label={`Linked route for invoice ${invoice.invoiceNumber}`}
                        size="sm"
                      >
                        <option value="">— None —</option>
                        {routes
                          .filter((route) => route.customerId === invoice.customerId)
                          .map((route) => (
                            <option key={route.id} value={route.id}>
                              {routeCode(route.id)}
                            </option>
                          ))}
                      </Select>
                    </td>
                    <td className={styles.numericCell}>${invoice.totalAmount.toFixed(2)}</td>
                    <td>
                      <Badge tone={STATUS_TONE[inferInvoiceStatus(invoice)]} dot>
                        {toTitleCase(inferInvoiceStatus(invoice))}
                      </Badge>
                    </td>
                    <td>
                      {formatLocalDateTime(invoice.emailSentAt)}
                    </td>
                    <td>
                      <div className={styles.pdfCell}>
                        {invoice.pdfS3Key ? (
                          <div className={styles.pdfCellRow}>
                            <Badge tone="success" size="sm">PDF Attached</Badge>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => onPdfAction(invoice, 'view')}
                              loading={pdfActionLoadingId === invoice.id}
                              disabled={uploadingId === invoice.id}
                              aria-label={`View PDF for invoice ${invoice.invoiceNumber}`}
                            >
                              {pdfActionLoadingId === invoice.id ? 'Opening...' : 'View'}
                            </Button>
                            <AdminRowMenu ariaLabel={`More PDF actions for invoice ${invoice.invoiceNumber}`}>
                              {!invoice.importedAt && (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => setConfirmAction({ type: 'regenerate', invoice })}
                                  loading={uploadingId === invoice.id}
                                  disabled={pdfActionLoadingId === invoice.id}
                                  aria-label={`Regenerate PDF for invoice ${invoice.invoiceNumber}`}
                                >
                                  {uploadingId === invoice.id ? 'Generating...' : 'Regenerate'}
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => onPdfAction(invoice, 'download')}
                                loading={pdfActionLoadingId === invoice.id}
                                disabled={uploadingId === invoice.id}
                                aria-label={`Download PDF for invoice ${invoice.invoiceNumber}`}
                              >
                                {pdfActionLoadingId === invoice.id ? 'Preparing...' : 'Download'}
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => onUploadClick(invoice.id)}
                                disabled={uploadingId === invoice.id || pdfActionLoadingId === invoice.id}
                                aria-label={`Replace PDF for invoice ${invoice.invoiceNumber}`}
                              >
                                Replace
                              </Button>
                            </AdminRowMenu>
                          </div>
                        ) : (
                          <div className={styles.pdfCellRow}>
                            <Badge tone="warning" size="sm">PDF Missing</Badge>
                            {!invoice.importedAt && (
                              <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                onClick={() => onGeneratePdf(invoice)}
                                loading={uploadingId === invoice.id}
                                aria-label={`Generate PDF for invoice ${invoice.invoiceNumber}`}
                              >
                                {uploadingId === invoice.id ? 'Generating...' : 'Generate PDF'}
                              </Button>
                            )}
                            <AdminRowMenu ariaLabel={`More PDF actions for invoice ${invoice.invoiceNumber}`}>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => onUploadClick(invoice.id)}
                                loading={uploadingId === invoice.id}
                                aria-label={`Upload PDF for invoice ${invoice.invoiceNumber}`}
                              >
                                {uploadingId === invoice.id ? 'Uploading...' : 'Upload PDF'}
                              </Button>
                            </AdminRowMenu>
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className={styles.actionsCell}>
                        {!isInvoicePaid(inferInvoiceStatus(invoice)) && (
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={() => setConfirmAction({ type: 'markPaid', invoice })}
                            aria-label={`Mark invoice ${invoice.invoiceNumber} as paid`}
                          >
                            Mark Paid
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => onEmailInvoiceToPrimary(invoice)}
                          loading={emailingInvoiceId === invoice.id}
                          aria-label={`${invoice.emailSentAt ? 'Resend' : 'Email'} invoice ${invoice.invoiceNumber}`}
                        >
                          {emailingInvoiceId === invoice.id ? 'Preparing...' : invoice.emailSentAt ? 'Resend' : 'Email'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className={styles.paginationBar} aria-label="invoices pagination">
            <p className={styles.paginationSummary} aria-live="polite">
              {`Showing ${(currentPage - 1) * ADMIN_PAGE_SIZE + 1}–${Math.min(sortedInvoices.length, currentPage * ADMIN_PAGE_SIZE)} of ${sortedInvoices.length} invoices`}
            </p>
            <div className={styles.paginationControls}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
                aria-label="Previous page of invoices"
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(currentPage + 1)}
                aria-label="Next page of invoices"
              >
                Next
              </Button>
            </div>
          </nav>
        </>
      )}
    </Card>
  );
}
