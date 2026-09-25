import { useCallback, useEffect, useState } from 'react';
import type { RateLine, Route } from '@/amplify/types';
import type { CustomerOption } from '@/app/administrator/invoices/types';
import { getFinalizedRouteDurationMinutes } from '@/lib/routeListHelpers';
import { listRateLines } from '@/lib/queries/ListRateLines';

const GST_RATE = 0.1;

function applyGst(subtotal: number, gstExclusive: boolean | null | undefined) {
  const gstAmount = gstExclusive ? subtotal * GST_RATE : 0;
  return { gstAmount, total: subtotal + gstAmount };
}

function getRouteDurationHours(route?: Route | null) {
  return Number((getFinalizedRouteDurationMinutes(route) / 60).toFixed(2));
}

export interface RateLineDraftCapability {
  items: RateLine[];
  quantities: Record<string, string>;
  visibleIds: ReadonlySet<string>;
  setQuantity: (rateLineId: string, value: string) => void;
  add: (rateLineId: string) => void;
  remove: (rateLineId: string) => void;
}

type UseInvoiceDraftParams = {
  // customerId/routeId are controlled: the page owns them because
  // useInvoicesDataState also needs to default-select the first customer
  // once it loads. Everything else the draft computes from them is internal.
  customerId: string;
  setCustomerId: (value: string) => void;
  routeId: string;
  setRouteId: (value: string) => void;
  customers: CustomerOption[];
  routes: Route[];
};

/**
 * Owns the invoice-create form's totalAmount/gstAmount and everything that
 * feeds it: the rate-card lines and their coordination with hours × rate.
 * Whether the total comes from hours × rate or from summed rate-card lines
 * is an internal decision (driven by whether the customer has rate lines) —
 * not something callers coordinate.
 */
export function useInvoiceDraft({
  customerId,
  setCustomerId,
  routeId,
  setRouteId,
  customers,
  routes,
}: UseInvoiceDraftParams) {
  const [totalHours, setTotalHours] = useState('0');
  const [totalAmountOverridden, setTotalAmountOverridden] = useState(false);
  const [totalAmount, setTotalAmount] = useState('0');
  const [gstAmount, setGstAmount] = useState('0');
  const [rateLineQuantities, setRateLineQuantities] = useState<Record<string, string>>({});
  // Rate lines whose quantity the admin has typed into directly — the hours
  // auto-fill effect below skips these so it doesn't clobber a manual edit.
  const [manuallyEditedRateLineIds, setManuallyEditedRateLineIds] = useState<ReadonlySet<string>>(new Set());
  // Non-hours rate lines revealed via the "Add rate card item" picker.
  const [visibleRateLineIds, setVisibleRateLineIds] = useState<ReadonlySet<string>>(new Set());

  const [rateLines, setRateLines] = useState<RateLine[]>([]);
  const hasRateLines = rateLines.length > 0;

  useEffect(() => {
    if (!customerId) {
      setRateLines([]);
      return;
    }

    let cancelled = false;

    void listRateLines(customerId).then((result) => {
      if (cancelled) return;
      setRateLines((result.data as RateLine[]) || []);
    });

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const selectedCustomer = customers.find((entry) => entry.id === customerId);
  const selectedRoute = routes.find((entry) => entry.id === routeId);

  const selectCustomer = useCallback((value: string) => {
    setCustomerId(value);
    setRouteId('');
    setTotalAmountOverridden(false);
    setRateLineQuantities({});
    setManuallyEditedRateLineIds(new Set());
    setVisibleRateLineIds(new Set());
  }, [setCustomerId, setRouteId]);

  const selectRoute = useCallback((value: string) => {
    setRouteId(value);
    setTotalAmountOverridden(false);
  }, [setRouteId]);

  const overrideTotal = useCallback((value: string) => {
    setTotalAmount(value);
    setTotalAmountOverridden(true);
    // A manually-typed total can't be reliably split back into subtotal + GST.
    setGstAmount('0');
  }, []);

  const setRateLineQuantity = useCallback((rateLineId: string, value: string) => {
    setRateLineQuantities((prev) => ({ ...prev, [rateLineId]: value }));
    setManuallyEditedRateLineIds((prev) => new Set(prev).add(rateLineId));
    setTotalAmountOverridden(false);
  }, []);

  const addRateLine = useCallback((rateLineId: string) => {
    setVisibleRateLineIds((prev) => new Set(prev).add(rateLineId));
  }, []);

  const removeRateLine = useCallback((rateLineId: string) => {
    setVisibleRateLineIds((prev) => {
      const next = new Set(prev);
      next.delete(rateLineId);
      return next;
    });
    setRateLineQuantities((prev) => {
      const next = { ...prev };
      delete next[rateLineId];
      return next;
    });
    setManuallyEditedRateLineIds((prev) => {
      const next = new Set(prev);
      next.delete(rateLineId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!routeId) {
      setTotalHours('0');
      setTotalAmount('0');
      return;
    }

    const route = routes.find((entry) => entry.id === routeId);
    if (!route) return;

    const routeHours = getRouteDurationHours(route);
    setTotalHours(routeHours.toFixed(2));

    if (totalAmountOverridden || hasRateLines) {
      return;
    }

    const customer = customers.find((entry) => entry.id === route.customerId);
    const rate = customer?.billingRatePerHour ?? 0;
    const subtotal = routeHours * rate;
    const { gstAmount: gst, total } = applyGst(subtotal, customer?.gstExclusive);
    setGstAmount(gst.toFixed(2));
    setTotalAmount(total.toFixed(2));
  }, [routeId, routes, customers, totalAmountOverridden, hasRateLines]);

  useEffect(() => {
    if (totalAmountOverridden || hasRateLines) return;
    const route = routes.find((entry) => entry.id === routeId);
    if (!route) return;

    const customer = customers.find((entry) => entry.id === route.customerId);
    const rate = customer?.billingRatePerHour ?? 0;
    const parsedHours = Number(totalHours);
    if (!Number.isFinite(parsedHours) || parsedHours < 0) return;

    const subtotal = parsedHours * rate;
    const { gstAmount: gst, total } = applyGst(subtotal, customer?.gstExclusive);
    setGstAmount(gst.toFixed(2));
    setTotalAmount(total.toFixed(2));
  }, [totalHours, routeId, routes, customers, totalAmountOverridden, hasRateLines]);

  useEffect(() => {
    if (!hasRateLines) return;

    const hourlyLines = rateLines.filter(
      (line) => line.unit === 'per_hour' && !manuallyEditedRateLineIds.has(line.id)
    );
    if (hourlyLines.length === 0) return;

    const route = routes.find((entry) => entry.id === routeId);
    const routeHours = getRouteDurationHours(route);
    const value = routeHours > 0 ? routeHours.toFixed(2) : '';

    setRateLineQuantities((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const line of hourlyLines) {
        if (next[line.id] !== value) {
          next[line.id] = value;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [routeId, routes, rateLines, hasRateLines, manuallyEditedRateLineIds]);

  useEffect(() => {
    if (!hasRateLines || totalAmountOverridden) return;

    const subtotal = rateLines.reduce((sum, line) => {
      const quantity = Number(rateLineQuantities[line.id] ?? 0);
      if (!Number.isFinite(quantity) || quantity <= 0) return sum;
      return sum + quantity * line.ratePerUnit;
    }, 0);

    const { gstAmount: gst, total } = applyGst(subtotal, selectedCustomer?.gstExclusive);
    setGstAmount(gst.toFixed(2));
    setTotalAmount(total.toFixed(2));
  }, [hasRateLines, rateLines, rateLineQuantities, selectedCustomer, totalAmountOverridden]);

  const rateLineCapability: RateLineDraftCapability = {
    items: rateLines,
    quantities: rateLineQuantities,
    visibleIds: visibleRateLineIds,
    setQuantity: setRateLineQuantity,
    add: addRateLine,
    remove: removeRateLine,
  };

  return {
    selectedCustomer,
    selectedRoute,
    totalHours,
    setTotalHours,
    totalAmount,
    gstAmount,
    rateLines: rateLineCapability,

    selectCustomer,
    selectRoute,
    overrideTotal,
  };
}
