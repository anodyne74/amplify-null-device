import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import type { RateLine, Route } from '@/amplify/types';
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

  const gstCustomers: CustomerOption[] = [
    { id: 'customer-1', name: 'Acme', billingRatePerHour: 100, gstExclusive: true },
  ];

  it('derives next invoice number and route-based hours/amount defaults', async () => {
    const { result } = renderHook(() => {
      const [invoiceNumber, setInvoiceNumber] = useState('');
      const [routeId, setRouteId] = useState('');
      const [totalHours, setTotalHours] = useState('0');
      const [totalAmount, setTotalAmount] = useState('0');
      const [gstAmount, setGstAmount] = useState('0');
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
        setGstAmount,
        totalHours,
      });

      return {
        invoiceNumber,
        routeId,
        setRouteId,
        totalHours,
        totalAmount,
        gstAmount,
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
      const [gstAmount, setGstAmount] = useState('0');
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
        setGstAmount,
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
        gstAmount,
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
    expect(result.current.gstAmount).toBe('0.00');
  });

  it('adds GST on top of the subtotal for a GST-exclusive customer', async () => {
    const { result } = renderHook(() => {
      const [, setInvoiceNumber] = useState('');
      const [routeId, setRouteId] = useState('');
      const [totalHours, setTotalHours] = useState('0');
      const [totalAmount, setTotalAmount] = useState('0');
      const [gstAmount, setGstAmount] = useState('0');
      const [invoiceNumberOverridden] = useState(false);
      const [totalAmountOverridden] = useState(false);

      useInvoiceDerivedFormEffects({
        invoices,
        invoiceNumberOverridden,
        setInvoiceNumber,
        routeId,
        routes,
        customers: gstCustomers,
        totalAmountOverridden,
        setTotalHours,
        setTotalAmount,
        setGstAmount,
        totalHours,
      });

      return { routeId, setRouteId, totalAmount, gstAmount };
    });

    act(() => {
      result.current.setRouteId('route-1');
    });

    await waitFor(() => {
      expect(result.current.gstAmount).toBe('20.00');
      expect(result.current.totalAmount).toBe('220.00');
    });
  });

  describe('auto-filling the per_hour rate line from route hours', () => {
    const hoursLine: RateLine = {
      id: 'line-hours',
      customerId: 'customer-1',
      label: 'Sign distribution & collection',
      ratePerUnit: 60,
      unit: 'per_hour',
    } as RateLine;
    const extraLine: RateLine = {
      id: 'line-extra',
      customerId: 'customer-1',
      label: 'Extra sign',
      ratePerUnit: 14,
      unit: 'per_sign',
    } as RateLine;

    function renderWithRateLines(rateLines: RateLine[]) {
      return renderHook(() => {
        const [, setInvoiceNumber] = useState('');
        const [routeId, setRouteId] = useState('');
        const [totalHours, setTotalHours] = useState('0');
        const [, setTotalAmount] = useState('0');
        const [, setGstAmount] = useState('0');
        const [invoiceNumberOverridden] = useState(false);
        const [totalAmountOverridden] = useState(false);
        const [rateLineQuantities, setRateLineQuantities] = useState<Record<string, string>>({});
        const [manuallyEditedRateLineIds, setManuallyEditedRateLineIds] = useState<ReadonlySet<string>>(new Set());

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
          setGstAmount,
          totalHours,
          hasRateLines: rateLines.length > 0,
          rateLines,
          setRateLineQuantities,
          manuallyEditedRateLineIds,
        });

        return {
          routeId,
          setRouteId,
          rateLineQuantities,
          manuallyEditedRateLineIds,
          setManuallyEditedRateLineIds,
        };
      });
    }

    it('fills the per_hour line quantity with the finalized route hours', async () => {
      const { result } = renderWithRateLines([hoursLine, extraLine]);

      act(() => {
        result.current.setRouteId('route-1');
      });

      await waitFor(() => {
        expect(result.current.rateLineQuantities['line-hours']).toBe('2.00');
      });
      expect(result.current.rateLineQuantities['line-extra']).toBeUndefined();
    });

    it('does not overwrite a manually-edited quantity', async () => {
      const { result } = renderWithRateLines([hoursLine]);

      act(() => {
        result.current.setRouteId('route-1');
      });
      await waitFor(() => {
        expect(result.current.rateLineQuantities['line-hours']).toBe('2.00');
      });

      act(() => {
        result.current.setManuallyEditedRateLineIds(new Set(['line-hours']));
      });
      act(() => {
        result.current.setRouteId('');
      });

      await waitFor(() => {
        expect(result.current.rateLineQuantities['line-hours']).toBe('2.00');
      });
    });

    it('does nothing when the customer has no per_hour line', async () => {
      const { result } = renderWithRateLines([extraLine]);

      act(() => {
        result.current.setRouteId('route-1');
      });

      await waitFor(() => {
        expect(result.current.routeId).toBe('route-1');
      });
      expect(result.current.rateLineQuantities).toEqual({});
    });
  });
});