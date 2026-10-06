/**
 * Pure helpers for the customer portal's invoice list: how an invoice's route
 * is labelled, the list's sort order, and the CSV export.
 */
import { formatInvoiceCurrency } from '@/lib/format';

export interface InvoiceListRow {
  id: string;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  periodStartDate?: string | null;
  periodEndDate?: string | null;
  totalAmount?: number | null;
  status?: string | null;
  routeId?: string | null;
  /** The invoice's Route Code, resolved by listMyInvoices / getInvoiceDetail. */
  routeCode?: string | null;
}

export function formatInvoiceDate(dateString?: string | null) {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * The Route Code customers know the route by. Falls back to the first 8
 * characters of the route ID when the route has no code or couldn't be read;
 * empty when the invoice has no route.
 */
export function getInvoiceRouteLabel(invoice: Pick<InvoiceListRow, 'routeId' | 'routeCode'>) {
  const code = invoice.routeCode?.trim();
  if (code) return code;
  return invoice.routeId ? invoice.routeId.slice(0, 8) : '';
}

/**
 * Newest invoice date first; ties go to the higher invoice number, then the
 * id, so the order is stable. Invoices without a date sort last.
 */
export function compareInvoiceDateDesc(
  a: Pick<InvoiceListRow, 'id' | 'invoiceDate' | 'invoiceNumber'>,
  b: Pick<InvoiceListRow, 'id' | 'invoiceDate' | 'invoiceNumber'>
) {
  const aTime = a.invoiceDate ? Date.parse(a.invoiceDate) : NaN;
  const bTime = b.invoiceDate ? Date.parse(b.invoiceDate) : NaN;
  const aHasDate = !Number.isNaN(aTime);
  const bHasDate = !Number.isNaN(bTime);

  if (aHasDate !== bHasDate) return aHasDate ? -1 : 1;
  if (aHasDate && bHasDate && aTime !== bTime) return bTime - aTime;

  const byNumber = (b.invoiceNumber || '').localeCompare(a.invoiceNumber || '', undefined, { numeric: true });
  if (byNumber !== 0) return byNumber;

  return b.id.localeCompare(a.id, undefined, { numeric: true });
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export function buildInvoicesCsv(invoices: InvoiceListRow[]) {
  const header = ['Invoice #', 'Route', 'Date', 'Period start', 'Period end', 'Amount', 'Status'];
  const rows = invoices.map((invoice) => [
    invoice.invoiceNumber || invoice.id,
    getInvoiceRouteLabel(invoice),
    formatInvoiceDate(invoice.invoiceDate),
    formatInvoiceDate(invoice.periodStartDate),
    formatInvoiceDate(invoice.periodEndDate),
    formatInvoiceCurrency(invoice.totalAmount),
    invoice.status || '',
  ]);

  return [header, ...rows].map((row) => row.map((cell) => csvEscape(String(cell))).join(',')).join('\r\n');
}
