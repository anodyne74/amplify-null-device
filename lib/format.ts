/**
 * Shared display formatters for customer-facing invoice and route views.
 *
 * Note: dashboard analytics use the en-AU/AUD formatters in
 * `lib/dashboardAnalytics.ts`; these helpers preserve the en-US/USD and
 * "Xh Ym" formats used by the customer invoice/route detail components.
 */

/**
 * Format an invoice amount as en-US USD currency.
 * Missing values render as "$0.00".
 */
export function formatInvoiceCurrency(amount?: number | null): string {
  if (amount === null || amount === undefined) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

/**
 * Format a duration in minutes as "Xh Ym".
 * Missing or zero durations render as "N/A".
 */
export function formatDurationHoursMinutes(minutes?: number | null): string {
  if (!minutes) return 'N/A';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

/**
 * Format a timestamp as "Today HH:MM", "Yesterday", or "D MMM" for compact
 * "last seen"-style table columns. Missing values render as "—".
 */
export function formatRelativeDay(isoTimestamp?: string | null): string {
  if (!isoTimestamp) return '—';
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return '—';

  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (dayDiff === 0) {
    return `Today ${new Intl.DateTimeFormat('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)}`;
  }
  if (dayDiff === 1) return 'Yesterday';
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' }).format(date);
}
