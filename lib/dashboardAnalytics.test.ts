import {
  getDeltaPercent,
  formatCurrency,
  formatDuration,
  formatPeriodDisplay,
  formatPeriodSummary,
} from './dashboardAnalytics';

describe('dashboardAnalytics', () => {
  describe('getDeltaPercent', () => {
    it('returns 0 when both current and previous are zero', () => {
      expect(getDeltaPercent(0, 0)).toBe(0);
    });

    it('returns 100 when previous is zero and current is non-zero', () => {
      expect(getDeltaPercent(10, 0)).toBe(100);
    });

    it('computes rounded percentage for normal values', () => {
      expect(getDeltaPercent(150, 100)).toBe(50);
      expect(getDeltaPercent(90, 100)).toBe(-10);
    });
  });

  describe('formatCurrency', () => {
    it('formats AUD currency with two decimals', () => {
      expect(formatCurrency(1234.5)).toBe('$1,234.50');
    });
  });

  describe('formatDuration', () => {
    it('formats minutes as hh:mm:00', () => {
      expect(formatDuration(75)).toBe('1:15:00');
      expect(formatDuration(5)).toBe('0:05:00');
    });
  });

  describe('formatPeriodDisplay', () => {
    it('returns the provided period key for all period variants', () => {
      expect(formatPeriodDisplay('2026-Q2', 'quarter')).toBe('2026-Q2');
      expect(formatPeriodDisplay('2026', 'year')).toBe('2026');
      expect(formatPeriodDisplay('2026-05', 'month')).toBe('2026-05');
      expect(formatPeriodDisplay('2026-W22', 'week')).toBe('2026-W22');
    });
  });

  describe('formatPeriodSummary', () => {
    it('formats week summary', () => {
      const date = new Date('2026-05-27T00:00:00Z');
      expect(formatPeriodSummary('week', date)).toBe('Week 2026-05-24 to 2026-05-30');
    });

    it('formats month summary', () => {
      const date = new Date('2026-05-27T00:00:00Z');
      expect(formatPeriodSummary('month', date)).toBe('May 2026');
    });

    it('formats quarter summary', () => {
      const date = new Date('2026-05-27T00:00:00Z');
      expect(formatPeriodSummary('quarter', date)).toBe('Quarter 2 2026');
    });

    it('formats year summary as fallback', () => {
      const date = new Date('2026-05-27T00:00:00Z');
      expect(formatPeriodSummary('year', date)).toBe('Year 2026');
    });
  });
});
