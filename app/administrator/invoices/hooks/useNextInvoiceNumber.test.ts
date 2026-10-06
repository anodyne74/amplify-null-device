import { act, renderHook } from '@testing-library/react';
import type { Invoice } from '@/app/administrator/invoices/types';
import { useNextInvoiceNumber } from '@/app/administrator/invoices/hooks/useNextInvoiceNumber';

describe('useNextInvoiceNumber', () => {
  const invoices: Invoice[] = [
    { id: 'invoice-1', invoiceNumber: 'INV-009', customerId: 'customer-1', totalAmount: 100 },
    { id: 'invoice-2', invoiceNumber: 'INV-010', customerId: 'customer-1', totalAmount: 100 },
  ];

  it('suggests the next invoice number after the highest existing one', () => {
    const { result } = renderHook(() => useNextInvoiceNumber(invoices));

    expect(result.current.invoiceNumber).toBe('INV-011');
  });

  it('suggests INV-001 when there are no existing invoices', () => {
    const { result } = renderHook(() => useNextInvoiceNumber([]));

    expect(result.current.invoiceNumber).toBe('INV-001');
  });

  it('stops suggesting once the admin types their own value', () => {
    const { result, rerender } = renderHook(
      ({ invoiceList }) => useNextInvoiceNumber(invoiceList),
      { initialProps: { invoiceList: invoices } }
    );

    act(() => {
      result.current.setInvoiceNumber('CUSTOM-1');
    });
    expect(result.current.invoiceNumber).toBe('CUSTOM-1');

    rerender({ invoiceList: [...invoices, { id: 'invoice-3', invoiceNumber: 'INV-011', customerId: 'customer-1', totalAmount: 100 }] });

    expect(result.current.invoiceNumber).toBe('CUSTOM-1');
  });
});
