import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import type { RateLine, Route } from '@/amplify/types';
import type { CustomerOption } from '@/app/administrator/invoices/types';
import { useInvoiceDraft } from '@/app/administrator/invoices/hooks/useInvoiceDraft';
import { listRateLines } from '@/lib/queries/ListRateLines';

jest.mock('@/lib/queries/ListRateLines', () => ({
  listRateLines: jest.fn(),
}));

describe('useInvoiceDraft', () => {
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

  beforeEach(() => {
    jest.clearAllMocks();
    (listRateLines as jest.Mock).mockResolvedValue({ data: [], errors: undefined });
  });

  function renderDraft(customerList: CustomerOption[] = customers) {
    return renderHook(() => {
      const [customerId, setCustomerId] = useState('');
      const [routeId, setRouteId] = useState('');
      const draft = useInvoiceDraft({
        customerId,
        setCustomerId,
        routeId,
        setRouteId,
        customers: customerList,
        routes,
      });

      return { customerId, routeId, ...draft };
    });
  }

  it('derives route-based hours/amount defaults on route selection', async () => {
    const { result } = renderDraft();

    act(() => {
      result.current.selectRoute('route-1');
    });

    await waitFor(() => {
      expect(result.current.totalHours).toBe('2.00');
      expect(result.current.totalAmount).toBe('200.00');
    });
  });

  it('recalculates amount from hours and preserves an overridden amount', async () => {
    const { result } = renderDraft();

    act(() => {
      result.current.selectRoute('route-1');
    });
    await waitFor(() => {
      expect(result.current.totalAmount).toBe('200.00');
    });

    act(() => {
      result.current.setTotalHours('3.00');
    });
    await waitFor(() => {
      expect(result.current.totalAmount).toBe('300.00');
    });

    act(() => {
      result.current.overrideTotal('555.00');
    });
    act(() => {
      result.current.setTotalHours('4.00');
    });

    await waitFor(() => {
      expect(result.current.totalHours).toBe('4.00');
    });
    expect(result.current.totalAmount).toBe('555.00');
    // overrideTotal can't reliably split a manually-typed total back into
    // subtotal + GST, so it zeroes gstAmount directly (not through applyGst,
    // hence the un-formatted '0' rather than '0.00').
    expect(result.current.gstAmount).toBe('0');
  });

  it('adds GST on top of the subtotal for a GST-exclusive customer', async () => {
    const { result } = renderDraft(gstCustomers);

    act(() => {
      result.current.selectRoute('route-1');
    });

    await waitFor(() => {
      expect(result.current.gstAmount).toBe('20.00');
      expect(result.current.totalAmount).toBe('220.00');
    });
  });

  it('selecting a customer resets route, override, and rate-line state', async () => {
    const { result } = renderDraft();

    act(() => {
      result.current.selectRoute('route-1');
    });
    await waitFor(() => {
      expect(result.current.totalAmount).toBe('200.00');
    });

    act(() => {
      result.current.overrideTotal('999.00');
    });
    act(() => {
      result.current.selectCustomer('customer-1');
    });

    expect(result.current.routeId).toBe('');
    await waitFor(() => {
      expect(result.current.totalAmount).toBe('0');
    });
  });

  describe('when the customer has rate-card lines', () => {
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

    function renderWithRateLines(rateLines: RateLine[], customerList = customers) {
      (listRateLines as jest.Mock).mockResolvedValue({ data: rateLines, errors: undefined });
      const view = renderDraft(customerList);
      act(() => {
        view.result.current.selectCustomer('customer-1');
      });
      return view;
    }

    it('fills the per_hour line quantity with the finalized route hours', async () => {
      const { result } = renderWithRateLines([hoursLine, extraLine]);
      await waitFor(() => {
        expect(result.current.rateLines.items).toHaveLength(2);
      });

      act(() => {
        result.current.selectRoute('route-1');
      });

      await waitFor(() => {
        expect(result.current.rateLines.quantities['line-hours']).toBe('2.00');
      });
      expect(result.current.rateLines.quantities['line-extra']).toBeUndefined();
    });

    it('does not overwrite a manually-edited quantity', async () => {
      const { result } = renderWithRateLines([hoursLine]);
      await waitFor(() => {
        expect(result.current.rateLines.items).toHaveLength(1);
      });

      act(() => {
        result.current.selectRoute('route-1');
      });
      await waitFor(() => {
        expect(result.current.rateLines.quantities['line-hours']).toBe('2.00');
      });

      act(() => {
        result.current.rateLines.setQuantity('line-hours', '9.00');
      });

      await waitFor(() => {
        expect(result.current.rateLines.quantities['line-hours']).toBe('9.00');
      });
    });

    it('sums quantity × rate across rate lines into the subtotal', async () => {
      const twoLines: RateLine[] = [
        { id: 'line-1', customerId: 'customer-1', label: 'Placement', ratePerUnit: 30 } as RateLine,
        { id: 'line-2', customerId: 'customer-1', label: 'Pickup', ratePerUnit: 10 } as RateLine,
      ];
      const { result } = renderWithRateLines(twoLines);
      await waitFor(() => {
        expect(result.current.rateLines.items).toHaveLength(2);
      });

      act(() => {
        result.current.rateLines.setQuantity('line-1', '18');
        result.current.rateLines.setQuantity('line-2', '18');
      });

      await waitFor(() => {
        expect(result.current.totalAmount).toBe('720.00');
      });
    });

    it('adds GST on the rate-card subtotal for a GST-exclusive customer', async () => {
      const twoLines: RateLine[] = [
        { id: 'line-1', customerId: 'customer-1', label: 'Placement', ratePerUnit: 30 } as RateLine,
        { id: 'line-2', customerId: 'customer-1', label: 'Pickup', ratePerUnit: 10 } as RateLine,
      ];
      const { result } = renderWithRateLines(twoLines, gstCustomers);
      await waitFor(() => {
        expect(result.current.rateLines.items).toHaveLength(2);
      });

      act(() => {
        result.current.rateLines.setQuantity('line-1', '10');
      });

      await waitFor(() => {
        expect(result.current.gstAmount).toBe('30.00');
      });
      expect(result.current.totalAmount).toBe('330.00');
    });

    it('preserves an overridden total across an unrelated picker interaction', async () => {
      const { result } = renderWithRateLines([hoursLine, extraLine]);
      await waitFor(() => {
        expect(result.current.rateLines.items).toHaveLength(2);
      });

      act(() => {
        result.current.selectRoute('route-1');
      });
      await waitFor(() => {
        expect(result.current.rateLines.quantities['line-hours']).toBe('2.00');
      });

      act(() => {
        result.current.overrideTotal('999.00');
      });
      act(() => {
        // Revealing a picker item doesn't touch quantities or the override —
        // the total should stay put.
        result.current.rateLines.add('line-extra');
      });

      expect(result.current.totalAmount).toBe('999.00');
    });

    it('selecting a route clears a manually overridden total', async () => {
      const { result } = renderWithRateLines([hoursLine]);
      await waitFor(() => {
        expect(result.current.rateLines.items).toHaveLength(1);
      });

      act(() => {
        result.current.overrideTotal('999.00');
      });
      act(() => {
        result.current.selectRoute('route-1');
      });

      await waitFor(() => {
        expect(result.current.rateLines.quantities['line-hours']).toBe('2.00');
      });
      expect(result.current.totalAmount).not.toBe('999.00');
    });

    it('does nothing when the customer has no per_hour line', async () => {
      const { result } = renderWithRateLines([extraLine]);
      await waitFor(() => {
        expect(result.current.rateLines.items).toHaveLength(1);
      });

      act(() => {
        result.current.selectRoute('route-1');
      });

      await waitFor(() => {
        expect(result.current.routeId).toBe('route-1');
      });
      expect(result.current.rateLines.quantities).toEqual({});
    });

    it('add/remove reveals and hides a rate line in the picker, clearing its quantity on remove', async () => {
      const { result } = renderWithRateLines([hoursLine, extraLine]);
      await waitFor(() => {
        expect(result.current.rateLines.items).toHaveLength(2);
      });

      act(() => {
        result.current.rateLines.add('line-extra');
      });
      expect(result.current.rateLines.visibleIds.has('line-extra')).toBe(true);

      act(() => {
        result.current.rateLines.setQuantity('line-extra', '5');
      });
      expect(result.current.rateLines.quantities['line-extra']).toBe('5');

      act(() => {
        result.current.rateLines.remove('line-extra');
      });
      expect(result.current.rateLines.visibleIds.has('line-extra')).toBe(false);
      expect(result.current.rateLines.quantities['line-extra']).toBeUndefined();
    });
  });
});
