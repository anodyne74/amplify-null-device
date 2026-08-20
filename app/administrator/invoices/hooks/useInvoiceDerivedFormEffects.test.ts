import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import type { Route } from '@/amplify/types';
import type { CustomerOption, Invoice } from '@/app/administrator/invoices/types';
import { useInvoiceDerivedFormEffects } from '@/app/administrator/invoices/hooks/useInvoiceDerivedFormEffects';

describe('useInvoiceDerivedFormEffects', () => {
  const invoices: Invoice[] = [
    { id: 'invoice-1', invoiceNumber: 'INV-009', customerId: 'customer-1', totalAmount: 100 },
    { id: 'invoice-2', invoiceNumber: 'INV-010', customerId: 'customer-1', totalAmount: 100 },
  ];

  const routes: Route[] = [
    {
      id: 'route-1',
      customerId: 'customer-1',
      routeCode: 'R-001',
      actualDurationMinutes: 120,
    } as Route,
  ];

  const customers: CustomerOption[] = [
    { id: 'customer-1', name: 'Acme', billingRatePerHour: 100 },
  ];

  it('derives next invoice number and route-based hours/amount defaults', async () => {
    const { result } = renderHook(() => {
      const [invoiceNumber, setInvoiceNumber] = useState('');
      const [routeId, setRouteId] = useState('');
      const [totalHours, setTotalHours] = useState('0');
      const [totalAmount, setTotalAmount] = useState('0');
      const [invoiceNumberOverridden] = useState(false);
      const [totalAmountOverridden] = useState(false);

      useInvoiceDerivedFormEffects({
        invoices,
        invoiceNumberOverridden,
        setInvoiceNumber,
        routeId,
        routes,
        customers,
        totalAmountOverridden,
        setTotalHours,
        setTotalAmount,
        totalHours,
      });

      return {
        invoiceNumber,
        routeId,
        setRouteId,
        totalHours,
        totalAmount,
      };
    });

    await waitFor(() => {
      expect(result.current.invoiceNumber).toBe('INV-011');
    });

    act(() => {
      result.current.setRouteId('route-1');
    });

    await waitFor(() => {
      expect(result.current.totalHours).toBe('2.00');
      expect(result.current.totalAmount).toBe('200.00');
    });
  });

  it('recalculates amount from hours and preserves overridden amount', async () => {
    const { result } = renderHook(() => {
      const [invoiceNumber, setInvoiceNumber] = useState('');
      const [routeId, setRouteId] = useState('route-1');
      const [totalHours, setTotalHours] = useState('2.00');
      const [totalAmount, setTotalAmount] = useState('200.00');
      const [invoiceNumberOverridden] = useState(false);
      const [totalAmountOverridden, setTotalAmountOverridden] = useState(false);

      useInvoiceDerivedFormEffects({
        invoices,
        invoiceNumberOverridden,
        setInvoiceNumber,
        routeId,
        routes,
        customers,
        totalAmountOverridden,
        setTotalHours,
        setTotalAmount,
        totalHours,
      });

      return {
        invoiceNumber,
        routeId,
        setRouteId,
        totalHours,
        setTotalHours,
        totalAmount,
        setTotalAmount,
        setTotalAmountOverridden,
      };
    });

    act(() => {
      result.current.setTotalHours('3.00');
    });

    await waitFor(() => {
      expect(result.current.totalAmount).toBe('300.00');
    });

    act(() => {
      result.current.setTotalAmountOverridden(true);
      result.current.setTotalAmount('555.00');
      result.current.setTotalHours('4.00');
    });

    await waitFor(() => {
      expect(result.current.totalHours).toBe('2.00');
    });
    expect(result.current.totalAmount).toBe('555.00');
  });
});