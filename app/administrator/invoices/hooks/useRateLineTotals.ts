import { useEffect } from 'react';
import type { RateLine } from '@/amplify/types';
import type { CustomerOption } from '@/app/administrator/invoices/types';
import { applyGst } from './useInvoiceDerivedFormEffects';

type UseRateLineTotalsParams = {
  rateLines: RateLine[];
  quantities: Record<string, string>;
  customer?: CustomerOption;
  totalAmountOverridden: boolean;
  setTotalAmount: (value: string) => void;
  setGstAmount: (value: string) => void;
};

/**
 * Owns totalAmount/gstAmount when the selected customer has rate-card lines —
 * useInvoiceDerivedFormEffects's hours×rate effects step aside via hasRateLines.
 */
export function useRateLineTotals({
  rateLines,
  quantities,
  customer,
  totalAmountOverridden,
  setTotalAmount,
  setGstAmount,
}: UseRateLineTotalsParams) {
  useEffect(() => {
    if (rateLines.length === 0 || totalAmountOverridden) return;

    const subtotal = rateLines.reduce((sum, line) => {
      const quantity = Number(quantities[line.id] ?? 0);
      if (!Number.isFinite(quantity) || quantity <= 0) return sum;
      return sum + quantity * line.ratePerUnit;
    }, 0);

    const { gstAmount, total } = applyGst(subtotal, customer?.gstExclusive);
    setGstAmount(gstAmount.toFixed(2));
    setTotalAmount(total.toFixed(2));
  }, [rateLines, quantities, customer, totalAmountOverridden, setTotalAmount, setGstAmount]);
}
