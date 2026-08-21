import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import type { RateLine } from '@/amplify/types';
import type { CustomerOption } from '@/app/administrator/invoices/types';
import { useRateLineTotals } from './useRateLineTotals';

describe('useRateLineTotals', () => {
  const rateLines: RateLine[] = [
    { id: 'line-1', customerId: 'cust-1', label: 'Placement', ratePerUnit: 30 } as RateLine,
    { id: 'line-2', customerId: 'cust-1', label: 'Pickup', ratePerUnit: 10 } as RateLine,
  ];

  it('sums quantity × rate across rate lines into the subtotal', async () => {
    const customer: CustomerOption = { id: 'cust-1', name: 'Acme' };

    const { result } = renderHook(() => {
      const [totalAmount, setTotalAmount] = useState('0');
      const [gstAmount, setGstAmount] = useState('0');

      useRateLineTotals({
        rateLines,
        quantities: { 'line-1': '18', 'line-2': '18' },
        customer,
        totalAmountOverridden: false,
        setTotalAmount,
        setGstAmount,
      });

      return { totalAmount, gstAmount };
    });

    await waitFor(() => {
      expect(result.current.totalAmount).toBe('720.00');
    });
    expect(result.current.gstAmount).toBe('0.00');
  });

  it('adds GST for a GST-exclusive customer', async () => {
    const customer: CustomerOption = { id: 'cust-1', name: 'Acme', gstExclusive: true };

    const { result } = renderHook(() => {
      const [totalAmount, setTotalAmount] = useState('0');
      const [gstAmount, setGstAmount] = useState('0');

      useRateLineTotals({
        rateLines,
        quantities: { 'line-1': '10', 'line-2': '0' },
        customer,
        totalAmountOverridden: false,
        setTotalAmount,
        setGstAmount,
      });

      return { totalAmount, gstAmount };
    });

    await waitFor(() => {
      expect(result.current.gstAmount).toBe('30.00');
    });
    expect(result.current.totalAmount).toBe('330.00');
  });

  it('does nothing once the total has been manually overridden', async () => {
    const customer: CustomerOption = { id: 'cust-1', name: 'Acme' };

    const { result } = renderHook(() => {
      const [totalAmount, setTotalAmount] = useState('999.00');
      const [gstAmount, setGstAmount] = useState('0');

      useRateLineTotals({
        rateLines,
        quantities: { 'line-1': '18' },
        customer,
        totalAmountOverridden: true,
        setTotalAmount,
        setGstAmount,
      });

      return { totalAmount, gstAmount };
    });

    act(() => {
      // allow effects to flush
    });

    expect(result.current.totalAmount).toBe('999.00');
  });
});
