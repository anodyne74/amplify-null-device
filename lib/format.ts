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
