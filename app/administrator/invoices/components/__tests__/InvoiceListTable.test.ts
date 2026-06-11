import { formatLocalDateTime } from '../InvoiceListTable';

describe('formatLocalDateTime', () => {
  it('returns — for null', () => {
    expect(formatLocalDateTime(null)).toBe('—');
  });

  it('returns — for undefined', () => {
    expect(formatLocalDateTime(undefined)).toBe('—');
  });

  it('formats a valid ISO datetime string', () => {
    const result = formatLocalDateTime('2025-06-04T04:14:00.000Z');
    expect(result).toMatch(/Jun/);
    expect(result).toMatch(/2025/);
  });
});
