import type { RateLine } from '@/amplify/types';

export interface LineItemInput {
  invoiceId: string;
  routeId?: string;
  customerId: string;
  description: string;
  quantity: number;
  ratePerUnit: number;
  amount: number;
  viewerSubs?: string[];
}

/**
 * Builds one LineItem input per rate line with a positive quantity. Pure —
 * the actual createLineItem call (and its errors) is the caller's concern.
 */
export function buildLineItemInputs({
  rateLines,
  quantities,
  invoiceId,
  customerId,
  routeId,
  viewerSubs,
}: {
  rateLines: RateLine[];
  quantities: Record<string, string>;
  invoiceId: string;
  customerId: string;
  routeId?: string;
  viewerSubs?: string[];
}): LineItemInput[] {
  return rateLines
    .map((line) => ({ line, quantity: Number(quantities[line.id] ?? 0) }))
    .filter(({ quantity }) => Number.isFinite(quantity) && quantity > 0)
    .map(({ line, quantity }) => ({
      invoiceId,
      routeId,
      customerId,
      description: line.label,
      quantity,
      ratePerUnit: line.ratePerUnit,
      amount: Number((quantity * line.ratePerUnit).toFixed(2)),
      viewerSubs,
    }));
}
