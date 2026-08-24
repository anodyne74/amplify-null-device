import { useEffect } from 'react';
import type { Route } from '@/amplify/types';
import type { CustomerOption, Invoice } from '@/app/administrator/invoices/types';

type UseInvoiceDerivedFormEffectsParams = {
  invoices: Invoice[];
  invoiceNumberOverridden: boolean;
  setInvoiceNumber: (value: string) => void;
  routeId: string;
  routes: Route[];
  customers: CustomerOption[];
  totalAmountOverridden: boolean;
  setTotalHours: (value: string) => void;
  setTotalAmount: (value: string) => void;
  setGstAmount: (value: string) => void;
  totalHours: string;
  // When the selected customer has rate-card lines, the rate-line picker (not this
  // hook) owns totalAmount/gstAmount — see useRateLineTotals.
  hasRateLines?: boolean;
};

export const GST_RATE = 0.1;

export function applyGst(subtotal: number, gstExclusive: boolean | null | undefined) {
  const gstAmount = gstExclusive ? subtotal * GST_RATE : 0;
  return { gstAmount, total: subtotal + gstAmount };
}

function getNextInvoiceNumber(invoices: Invoice[]) {
  const matches = invoices
    .map((invoice) => {
      const number = invoice.invoiceNumber?.trim();
      if (!number) return null;
      const numericMatch = number.match(/(\d+)(?!.*\d)/);
      if (!numericMatch) return null;
      return {
        prefix: number.slice(0, number.length - numericMatch[1].length),
        numeric: Number(numericMatch[1]),
        width: numericMatch[1].length,
      };
    })
    .filter((value): value is { prefix: string; numeric: number; width: number } => Boolean(value));

  if (matches.length === 0) {
    return 'INV-001';
  }

  const maxNumeric = Math.max(...matches.map((entry) => entry.numeric));
  const widest = Math.max(3, ...matches.map((entry) => entry.width));
  const preferredPrefix = matches.find((entry) => entry.prefix)?.prefix ?? 'INV-';
  return `${preferredPrefix}${String(maxNumeric + 1).padStart(widest, '0')}`;
}

function getRouteDurationHours(route?: Route | null) {
  if (!route) return 0;
  const minutes = route.overrideDurationMinutes ?? route.actualDurationMinutes ?? 0;
  return Number((minutes / 60).toFixed(2));
}

export function useInvoiceDerivedFormEffects({
  invoices,
  invoiceNumberOverridden,
  setInvoiceNumber,
  routeId,
  routes,
  customers,
  totalAmountOverridden,
  setTotalHours,
  setTotalAmount,
  setGstAmount,
  totalHours,
  hasRateLines = false,
}: UseInvoiceDerivedFormEffectsParams) {
  useEffect(() => {
    if (invoiceNumberOverridden) return;
    setInvoiceNumber(getNextInvoiceNumber(invoices));
  }, [invoices, invoiceNumberOverridden, setInvoiceNumber]);

  useEffect(() => {
    if (!routeId) {
      setTotalHours('0');
      setTotalAmount('0');
      return;
    }

    const selectedRoute = routes.find((route) => route.id === routeId);
    if (!selectedRoute) return;

    const routeHours = getRouteDurationHours(selectedRoute);
    setTotalHours(routeHours.toFixed(2));

    if (totalAmountOverridden || hasRateLines) {
      return;
    }

    const customer = customers.find((entry) => entry.id === selectedRoute.customerId);
    const rate = customer?.billingRatePerHour ?? 0;
    const subtotal = routeHours * rate;
    const { gstAmount, total } = applyGst(subtotal, customer?.gstExclusive);
    setGstAmount(gstAmount.toFixed(2));
    setTotalAmount(total.toFixed(2));
  }, [routeId, routes, customers, setTotalAmount, setGstAmount, setTotalHours, totalAmountOverridden, hasRateLines]);

  useEffect(() => {
    if (totalAmountOverridden || hasRateLines) return;
    const selectedRoute = routes.find((route) => route.id === routeId);
    if (!selectedRoute) return;

    const customer = customers.find((entry) => entry.id === selectedRoute.customerId);
    const rate = customer?.billingRatePerHour ?? 0;
    const parsedHours = Number(totalHours);
    if (!Number.isFinite(parsedHours) || parsedHours < 0) return;

    const subtotal = parsedHours * rate;
    const { gstAmount, total } = applyGst(subtotal, customer?.gstExclusive);
    setGstAmount(gstAmount.toFixed(2));
    setTotalAmount(total.toFixed(2));
  }, [totalHours, routeId, routes, customers, setTotalAmount, setGstAmount, totalAmountOverridden, hasRateLines]);
}