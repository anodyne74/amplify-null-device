import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  CustomerPortalContextProvider,
  useCustomerPortalContext,
  type CustomerPortalContext,
} from '@/lib/useCustomerPortalContext';
import { useCurrentUserId } from '@/lib/use-user-groups';
import { getCustomerPortalContext } from '@/lib/customers';

jest.mock('@/lib/customers', () => ({
  getCustomerPortalContext: jest.fn(),
}));

jest.mock('@/lib/use-user-groups', () => ({
  useCurrentUserId: jest.fn(),
}));

describe('useCustomerPortalContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useCurrentUserId as jest.Mock).mockReturnValue('user-1');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('defaults to a read_only role while the context is still loading', () => {
    (getCustomerPortalContext as jest.Mock).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useCustomerPortalContext());

    expect(result.current.loading).toBe(true);
    expect(result.current.role).toBe('read_only');
    expect(result.current.customerId).toBeNull();
  });

  it('resolves role/customerId without a provider ancestor', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'account_owner',
      customerId: 'customer-1',
    });

    const { result } = renderHook(() => useCustomerPortalContext());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.role).toBe('account_owner');
    expect(result.current.customerId).toBe('customer-1');
    expect(result.current.error).toBeNull();
    expect(getCustomerPortalContext).toHaveBeenCalledWith('user-1');
  });

  it('surfaces an error and stays read_only when no customerId resolves', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'account_owner',
      customerId: '',
    });

    const { result } = renderHook(() => useCustomerPortalContext());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.role).toBe('account_owner');
    expect(result.current.customerId).toBeNull();
    expect(result.current.error).toBe('Could not resolve your customer account.');
  });

  it('falls back to read_only and surfaces the error message when resolution rejects', async () => {
    (getCustomerPortalContext as jest.Mock).mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useCustomerPortalContext());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.role).toBe('read_only');
    expect(result.current.customerId).toBeNull();
    expect(result.current.error).toBe('network down');
  });

  it('runs fetchData once a customerId resolves and exposes the result via data/setData', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'account_owner',
      customerId: 'customer-1',
    });
    const fetchData = jest.fn().mockResolvedValue('fetched-value');

    const { result } = renderHook(() => useCustomerPortalContext({ fetchData }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(fetchData).toHaveBeenCalledWith({
      userId: 'user-1',
      role: 'account_owner',
      customerId: 'customer-1',
    });
    expect(result.current.data).toBe('fetched-value');

    act(() => {
      result.current.setData('overridden');
    });

    expect(result.current.data).toBe('overridden');
  });

  it('surfaces a thrown fetchData error without clobbering context state', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'account_owner',
      customerId: 'customer-1',
    });
    const fetchData = jest.fn().mockRejectedValue(new Error('Could not load billing details.'));

    const { result } = renderHook(() => useCustomerPortalContext({ fetchData }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Could not load billing details.');
    expect(result.current.customerId).toBe('customer-1');
  });

  it('re-runs fetchData when a fetchDataDeps value changes, independent of customerId', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'account_owner',
      customerId: 'customer-1',
    });
    const fetchData = jest.fn().mockImplementation((context: CustomerPortalContext) => Promise.resolve(`data-for-${context.customerId}`));

    const { rerender } = renderHook(
      ({ id }: { id: string }) => useCustomerPortalContext({ fetchData, fetchDataDeps: [id] }),
      { initialProps: { id: 'route-1' } }
    );

    await waitFor(() => {
      expect(fetchData).toHaveBeenCalledTimes(1);
    });

    rerender({ id: 'route-2' });

    await waitFor(() => {
      expect(fetchData).toHaveBeenCalledTimes(2);
    });
  });

  it('resolves getCustomerPortalContext only once for multiple consumers under a shared provider', async () => {
    (getCustomerPortalContext as jest.Mock).mockResolvedValue({
      role: 'account_owner',
      customerId: 'customer-1',
    });

    // Simulates CustomerLayout and a page both calling useCustomerPortalContext()
    // beneath the same CustomerPortalContextProvider mount.
    function useTwoConsumers() {
      const layout = useCustomerPortalContext();
      const page = useCustomerPortalContext();
      return { layout, page };
    }

    const { result } = renderHook(() => useTwoConsumers(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <CustomerPortalContextProvider>{children}</CustomerPortalContextProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current.layout.loading).toBe(false);
      expect(result.current.page.loading).toBe(false);
    });

    expect(result.current.layout.customerId).toBe('customer-1');
    expect(result.current.page.customerId).toBe('customer-1');
    expect(getCustomerPortalContext).toHaveBeenCalledTimes(1);
  });
});
