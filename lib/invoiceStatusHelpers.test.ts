import { getInvoiceStatusTone } from '@/lib/invoiceStatusHelpers';

describe('getInvoiceStatusTone', () => {
  it('maps paid to success', () => {
    expect(getInvoiceStatusTone('paid')).toBe('success');
  });

  it('maps in-flight statuses to warning', () => {
    expect(getInvoiceStatusTone('pending')).toBe('warning');
    expect(getInvoiceStatusTone('sent')).toBe('warning');
    expect(getInvoiceStatusTone('viewed')).toBe('warning');
  });

  it('maps overdue and cancelled to danger', () => {
    expect(getInvoiceStatusTone('overdue')).toBe('danger');
    expect(getInvoiceStatusTone('cancelled')).toBe('danger');
  });

  it('falls back to neutral for draft, unknown, and missing statuses', () => {
    expect(getInvoiceStatusTone('draft')).toBe('neutral');
    expect(getInvoiceStatusTone('something_else')).toBe('neutral');
    expect(getInvoiceStatusTone(undefined)).toBe('neutral');
    expect(getInvoiceStatusTone(null)).toBe('neutral');
  });
});
