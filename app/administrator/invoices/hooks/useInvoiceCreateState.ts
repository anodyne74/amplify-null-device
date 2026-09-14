import { useState } from 'react';

export function useInvoiceCreateState() {
  const [customerId, setCustomerId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceNumberOverridden, setInvoiceNumberOverridden] = useState(false);
  const [totalHours, setTotalHours] = useState('0');
  const [totalAmountOverridden, setTotalAmountOverridden] = useState(false);
  const [totalAmount, setTotalAmount] = useState('0');
  const [gstAmount, setGstAmount] = useState('0');
  const [rateLineQuantities, setRateLineQuantities] = useState<Record<string, string>>({});
  // Rate lines whose quantity the admin has typed into directly — the hours
  // auto-fill effect (useInvoiceDerivedFormEffects) skips these so it doesn't
  // clobber a manual edit.
  const [manuallyEditedRateLineIds, setManuallyEditedRateLineIds] = useState<ReadonlySet<string>>(new Set());
  // Non-hours rate lines revealed via the "Add rate card item" picker.
  const [visibleRateLineIds, setVisibleRateLineIds] = useState<ReadonlySet<string>>(new Set());

  const handleCustomerChange = (value: string) => {
    setCustomerId(value);
    setRouteId('');
    setTotalAmountOverridden(false);
    setRateLineQuantities({});
    setManuallyEditedRateLineIds(new Set());
    setVisibleRateLineIds(new Set());
  };

  const handleRateLineQuantityChange = (rateLineId: string, value: string) => {
    setRateLineQuantities((prev) => ({ ...prev, [rateLineId]: value }));
    setManuallyEditedRateLineIds((prev) => new Set(prev).add(rateLineId));
    setTotalAmountOverridden(false);
  };

  const handleAddRateLine = (rateLineId: string) => {
    setVisibleRateLineIds((prev) => new Set(prev).add(rateLineId));
  };

  const handleRemoveRateLine = (rateLineId: string) => {
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
  };

  const handleRouteChange = (value: string) => {
    setRouteId(value);
    setTotalAmountOverridden(false);
  };

  const handleInvoiceNumberChange = (value: string) => {
    setInvoiceNumber(value);
    setInvoiceNumberOverridden(true);
  };

  const handleTotalAmountChange = (value: string) => {
    setTotalAmount(value);
    setTotalAmountOverridden(true);
    // A manually-typed total can't be reliably split back into subtotal + GST.
    setGstAmount('0');
  };

  const resetAfterCreate = () => {
    setInvoiceNumberOverridden(false);
    setTotalAmountOverridden(false);
    setInvoiceNumber('');
    setTotalHours('0');
    setTotalAmount('0');
    setGstAmount('0');
    setRouteId('');
    setRateLineQuantities({});
    setManuallyEditedRateLineIds(new Set());
    setVisibleRateLineIds(new Set());
  };

  return {
    customerId,
    setCustomerId,
    routeId,
    setRouteId,
    invoiceNumber,
    setInvoiceNumber,
    invoiceNumberOverridden,
    setInvoiceNumberOverridden,
    totalHours,
    setTotalHours,
    totalAmountOverridden,
    setTotalAmountOverridden,
    totalAmount,
    setTotalAmount,
    gstAmount,
    setGstAmount,
    rateLineQuantities,
    setRateLineQuantities,
    manuallyEditedRateLineIds,
    visibleRateLineIds,
    handleCustomerChange,
    handleRouteChange,
    handleInvoiceNumberChange,
    handleTotalAmountChange,
    handleRateLineQuantityChange,
    handleAddRateLine,
    handleRemoveRateLine,
    resetAfterCreate,
  };
}