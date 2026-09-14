import { deriveInvoiceStatus, round2 } from '../import-prep.js';

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

describe('round2', () => {
  it('rounds to two decimal places', () => {
    expect(round2(30.005)).toBe(30.01);
  });

  it('computes 10% GST amount for a whole-dollar total', () => {
    expect(round2(300 * 0.1)).toBe(30);
  });

  it('handles values that already have two decimal places', () => {
    expect(round2(12.34)).toBe(12.34);
  });
});
