import { deriveInvoiceStatus } from '../import-prep.js';

describe('deriveInvoiceStatus', () => {
  it('returns paid when paidDate is set', () => {
    expect(deriveInvoiceStatus('2025-01-01', '2025-02-01')).toBe('paid');
  });

  it('returns sent when only sentDate is set', () => {
    expect(deriveInvoiceStatus('2025-01-01', null)).toBe('sent');
  });

  it('returns draft when neither date is set', () => {
    expect(deriveInvoiceStatus(null, null)).toBe('draft');
  });

  it('returns draft when both dates are empty strings', () => {
    expect(deriveInvoiceStatus('', '')).toBe('draft');
  });
});
