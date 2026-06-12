export type InvoiceStatusTone = 'success' | 'warning' | 'danger' | 'neutral';

/**
 * Map an invoice status to a semantic tone. Components own their CSS-module
 * class lookup keyed by the returned tone (classes are module-scoped, so this
 * helper must not return raw class names).
 */
export function getInvoiceStatusTone(status?: string | null): InvoiceStatusTone {
  switch (status) {
    case 'paid':
      return 'success';
    case 'pending':
    case 'sent':
    case 'viewed':
      return 'warning';
    case 'overdue':
    case 'cancelled':
      return 'danger';
    default:
      // draft, unknown, missing
      return 'neutral';
  }
}
