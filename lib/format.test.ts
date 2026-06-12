import { formatInvoiceCurrency, formatDurationHoursMinutes } from '@/lib/format';

describe('format helpers', () => {
  describe('formatInvoiceCurrency', () => {
    it('formats amounts as en-US USD currency', () => {
      expect(formatInvoiceCurrency(1234.5)).toBe('$1,234.50');
      expect(formatInvoiceCurrency(12)).toBe('$12.00');
      expect(formatInvoiceCurrency(0)).toBe('$0.00');
    });

    it('falls back to $0.00 for missing values', () => {
      expect(formatInvoiceCurrency(null)).toBe('$0.00');
      expect(formatInvoiceCurrency(undefined)).toBe('$0.00');
    });
  });

  describe('formatDurationHoursMinutes', () => {
    it('formats minutes as "Xh Ym"', () => {
      expect(formatDurationHoursMinutes(75)).toBe('1h 15m');
      expect(formatDurationHoursMinutes(60)).toBe('1h 0m');
      expect(formatDurationHoursMinutes(5)).toBe('0h 5m');
    });

    it('falls back to N/A for missing or zero durations', () => {
      expect(formatDurationHoursMinutes(0)).toBe('N/A');
      expect(formatDurationHoursMinutes(null)).toBe('N/A');
      expect(formatDurationHoursMinutes(undefined)).toBe('N/A');
    });
  });
});
