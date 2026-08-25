export interface DriverSplitPreviewInput {
  /** Pre-GST amount this invoice covers. */
  billedAmount: number;
  driverSplitPercent?: number | null;
}

export interface DriverSplitPreviewResult {
  splitPercent: number;
  driverShare: number;
  retained: number;
}

/**
 * Internal-only (admin-side) driver-split preview for a single invoice being
 * created — separate from lib/driverSplit.ts's computeDriverSplit, which
 * aggregates across a customer's completed routes for a payout *period* and
 * isn't a good fit for previewing one not-yet-created, single-route invoice.
 */
export function computeDriverSplitPreview({
  billedAmount,
  driverSplitPercent,
}: DriverSplitPreviewInput): DriverSplitPreviewResult {
  const splitPercent = driverSplitPercent ?? 0;
  const safeBilled = Number.isFinite(billedAmount) ? billedAmount : 0;
  const driverShare = Number((safeBilled * (splitPercent / 100)).toFixed(2));
  const retained = Number((safeBilled - driverShare).toFixed(2));
  return { splitPercent, driverShare, retained };
}
