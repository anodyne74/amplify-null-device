import type { Route } from '@/amplify/types';
import AdminActionButton from '@/app/components/AdminActionButton';
import AdminDataTable from '@/app/components/AdminDataTable';
import AdminListState from '@/app/components/AdminListState';
import AdminRowMenu from '@/app/components/AdminRowMenu';
import AdminSectionHeader from '@/app/components/AdminSectionHeader';
import type { Invoice, InvoiceStatus } from '@/app/administrator/invoices/types';
import styles from '@/app/dashboard.module.css';
import invoiceStyles from '@/app/administrator/invoices/page.module.css';

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

export function formatLocalDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
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
}: InvoiceListTableProps) {
  const handleRegeneratePdf = (invoice: Invoice) => {
    const confirmed = window.confirm(
      `Regenerate invoice ${invoice.invoiceNumber}? This will replace the attached PDF.`
    );
    if (!confirmed) return;
    onGeneratePdf(invoice);
  };

  return (
    <div className={`${styles.infoPanel} ${invoiceStyles.listPanel}`}>
      <AdminSectionHeader title="Invoice List" titleClassName={invoiceStyles.panelHeading} />
      {loading || invoices.length === 0 ? (
        <AdminListState
          loading={loading}
          empty={!loading && invoices.length === 0}
          loadingMessage="Loading invoices..."
          emptyMessage="No invoices yet."
        />
      ) : (
        <AdminDataTable
          ariaLabel="Invoice list"
          wrapClassName={invoiceStyles.tableWrap}
          tableClassName={invoiceStyles.invoiceTable}
        >
          <thead>
            <tr>
              <th scope="col">Invoice #</th>
              <th scope="col">Customer</th>
              <th scope="col">Route</th>
              <th scope="col">Total</th>
              <th scope="col">Status</th>
              <th scope="col">Sent</th>
              <th scope="col">PDF</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
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
                    <span className={`${invoiceStyles.statusChip} ${getStatusChipClass(invoice.status)}`}>
                      {toTitleCase(invoice.status ?? 'draft')}
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
                              onClick={() => handleRegeneratePdf(invoice)}
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
                      {!isInvoicePaid(invoice.status) && (
                        <AdminActionButton
                          className={invoiceStyles.markPaidButton}
                          variant="primary"
                          onClick={() => onMarkPaid(invoice.id)}
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
      )}
    </div>
  );
}
