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

  const handleCustomerChange = (value: string) => {
    setCustomerId(value);
    setRouteId('');
    setTotalAmountOverridden(false);
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
    handleCustomerChange,
    handleRouteChange,
    handleInvoiceNumberChange,
    handleTotalAmountChange,
    resetAfterCreate,
  };
}