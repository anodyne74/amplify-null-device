import { useEffect, useState } from 'react';
import type { Invoice } from '@/app/administrator/invoices/types';

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

/**
 * Suggests the next invoice number from existing invoices, until the admin
 * types their own — an override is sticky for the life of the form.
 */
export function useNextInvoiceNumber(invoices: Invoice[]) {
  const [invoiceNumber, setInvoiceNumberState] = useState('');
  const [overridden, setOverridden] = useState(false);

  useEffect(() => {
    if (overridden) return;
    setInvoiceNumberState(getNextInvoiceNumber(invoices));
  }, [invoices, overridden]);

  const setInvoiceNumber = (value: string) => {
    setInvoiceNumberState(value);
    setOverridden(true);
  };

  return { invoiceNumber, setInvoiceNumber };
}
