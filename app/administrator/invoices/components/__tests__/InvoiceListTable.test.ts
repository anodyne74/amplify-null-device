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
    expect(result).toMatch(/4 Jun(?:e)? 2025/);
    expect(result).toMatch(/2:14/);
  });
});
