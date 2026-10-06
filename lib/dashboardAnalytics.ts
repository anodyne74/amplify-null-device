import type { AnalyticsPeriod } from './aggregateRouteData';

export function getDeltaPercent(current: number, previous: number): number {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }

  return Math.round(((current - previous) / previous) * 100);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}:${mins.toString().padStart(2, '0')}:00`;
}

/**
 * Format a duration in minutes as "Xh Ym" for compact stat-tile display
 * (e.g. average route duration on the Drivers screen). Distinct from
 * formatDurationHoursMinutes in lib/format.ts, which is reserved for
 * customer-facing invoice/route views per that file's own note.
 */
export function formatDurationCompact(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}

export function formatPeriodDisplay(periodKey: string, period: AnalyticsPeriod): string {
  if (period === 'quarter') return periodKey;
  if (period === 'year') return periodKey;
  if (period === 'month') return periodKey;
  return periodKey;
}

export function formatPeriodSummary(period: AnalyticsPeriod, date = new Date()): string {
  if (period === 'week') {
    const start = new Date(date);
    start.setDate(date.getDate() - date.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `Week ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`;
  }

  if (period === 'month') {
    return date.toLocaleString('en-AU', { month: 'long', year: 'numeric' });
  }

  if (period === 'quarter') {
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `Quarter ${quarter} ${date.getFullYear()}`;
  }

  return `Year ${date.getFullYear()}`;
}