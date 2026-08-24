import { renderHook, waitFor } from '@testing-library/react';
import { useCustomerRateLines } from './useCustomerRateLines';
import { listRateLines } from '@/lib/queries/ListRateLines';

jest.mock('@/lib/queries/ListRateLines', () => ({
  listRateLines: jest.fn(),
}));

describe('useCustomerRateLines', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches rate lines for the given customer', async () => {
    (listRateLines as jest.Mock).mockResolvedValue({
      data: [{ id: 'line-1', customerId: 'cust-1', label: 'Placement', ratePerUnit: 30 }],
      errors: undefined,
    });

    const { result } = renderHook(() => useCustomerRateLines('cust-1'));

    await waitFor(() => {
      expect(result.current.rateLines).toHaveLength(1);
    });

    expect(listRateLines).toHaveBeenCalledWith('cust-1');
    expect(result.current.loading).toBe(false);
  });

  it('clears rate lines when no customer is selected', async () => {
    (listRateLines as jest.Mock).mockResolvedValue({
      data: [{ id: 'line-1', customerId: 'cust-1', label: 'Placement', ratePerUnit: 30 }],
      errors: undefined,
    });

    const { result, rerender } = renderHook(({ customerId }) => useCustomerRateLines(customerId), {
      initialProps: { customerId: 'cust-1' },
    });

    await waitFor(() => {
      expect(result.current.rateLines).toHaveLength(1);
    });

    rerender({ customerId: '' });

    await waitFor(() => {
      expect(result.current.rateLines).toEqual([]);
    });
    // Only the initial 'cust-1' render should have triggered a fetch.
    expect(listRateLines).toHaveBeenCalledTimes(1);
  });
});
