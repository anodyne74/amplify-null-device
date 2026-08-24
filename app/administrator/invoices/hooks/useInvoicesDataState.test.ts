import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { useInvoicesDataState } from '@/app/administrator/invoices/hooks/useInvoicesDataState';
import { listAllRoutes } from '@/lib/queries/ListAllRoutes';
import { listCustomerUsers, listCustomers, listInvoices } from '@/lib/queries';

jest.mock('@/lib/queries/ListAllRoutes', () => ({
  listAllRoutes: jest.fn(),
}));

jest.mock('@/lib/queries', () => ({
  listCustomerUsers: jest.fn(),
  listCustomers: jest.fn(),
  listInvoices: jest.fn(),
}));

describe('useInvoicesDataState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads paginated customers/invoices/routes, enriches primary email, and sorts invoices', async () => {
    (listCustomers as jest.Mock)
      .mockResolvedValueOnce({
        data: [{ id: 'customer-1', name: 'Acme', email: 'fallback@acme.test', billingRatePerHour: 120 }],
        errors: undefined,
        nextToken: 'next-customers',
      })
      .mockResolvedValueOnce({
        data: [{ id: 'customer-2', name: 'Globex', email: 'ops@globex.test', billingRatePerHour: 95 }],
        errors: undefined,
        nextToken: null,
      });

    (listCustomerUsers as jest.Mock)
      .mockResolvedValueOnce({
        data: [{ role: 'account_owner', email: 'owner@acme.test' }],
      })
      .mockResolvedValueOnce({
        data: [],
      });

    (listInvoices as jest.Mock)
      .mockResolvedValueOnce({
        data: [
          {
            id: 'invoice-1',
            invoiceNumber: 'INV-100',
            customerId: 'customer-1',
            totalAmount: 100,
            createdAt: '2026-01-01T10:00:00Z',
            invoiceDate: '2026-01-01',
          },
        ],
        errors: undefined,
        nextToken: 'next-invoices',
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'invoice-2',
            invoiceNumber: 'INV-101',
            customerId: 'customer-2',
            totalAmount: 200,
            createdAt: '2026-01-03T10:00:00Z',
            invoiceDate: '2026-01-03',
          },
        ],
        errors: undefined,
        nextToken: null,
      });

    (listAllRoutes as jest.Mock).mockResolvedValue({
      data: [{ id: 'route-1', customerId: 'customer-1', routeCode: 'R1', actualDurationMinutes: 120 }],
      errors: undefined,
      nextToken: null,
    });

    const { result } = renderHook(() => {
      const [customerId, setCustomerId] = useState('');
      const [error, setError] = useState<string | null>(null);
      const [loading, setLoading] = useState(false);
      const hook = useInvoicesDataState({ customerId, setCustomerId, setError, setLoading });

      return {
        customerId,
        error,
        loading,
        ...hook,
      };
    });

    await act(async () => {
      await result.current.fetchData();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.customerId).toBe('customer-1');
    expect(result.current.customers).toEqual([
      expect.objectContaining({ id: 'customer-1', primaryEmail: 'owner@acme.test' }),
      expect.objectContaining({ id: 'customer-2', primaryEmail: 'ops@globex.test' }),
    ]);
    expect(result.current.routes).toHaveLength(1);
    expect(result.current.invoices).toHaveLength(2);
    expect(result.current.sortedInvoices.map((invoice) => invoice.id)).toEqual(['invoice-2', 'invoice-1']);
    expect(listCustomers).toHaveBeenCalledTimes(2);
    expect(listInvoices).toHaveBeenCalledTimes(2);
  });

  it('sets invoice load error when invoice query returns errors', async () => {
    (listCustomers as jest.Mock).mockResolvedValue({
      data: [{ id: 'customer-1', name: 'Acme', email: 'fallback@acme.test' }],
      errors: undefined,
      nextToken: null,
    });
    (listCustomerUsers as jest.Mock).mockResolvedValue({ data: [] });
    (listAllRoutes as jest.Mock).mockResolvedValue({ data: [], errors: undefined, nextToken: null });
    (listInvoices as jest.Mock).mockResolvedValue({ data: [], errors: [{ message: 'boom' }], nextToken: null });

    const { result } = renderHook(() => {
      const [customerId, setCustomerId] = useState('');
      const [error, setError] = useState<string | null>(null);
      const [loading, setLoading] = useState(false);
      const hook = useInvoicesDataState({ customerId, setCustomerId, setError, setLoading });

      return {
        error,
        loading,
        ...hook,
      };
    });

    await act(async () => {
      await result.current.fetchData();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Failed to load invoices.');
    expect(result.current.invoices).toEqual([]);
  });

  it('removes an invoice from state via removeInvoiceFromState (#63)', async () => {
    (listCustomers as jest.Mock).mockResolvedValue({ data: [], errors: undefined, nextToken: null });
    (listCustomerUsers as jest.Mock).mockResolvedValue({ data: [] });
    (listAllRoutes as jest.Mock).mockResolvedValue({ data: [], errors: undefined, nextToken: null });
    (listInvoices as jest.Mock).mockResolvedValue({
      data: [
        { id: 'invoice-1', invoiceNumber: 'INV-100', customerId: 'customer-1', totalAmount: 100 },
        { id: 'invoice-2', invoiceNumber: 'INV-101', customerId: 'customer-1', totalAmount: 200 },
      ],
      errors: undefined,
      nextToken: null,
    });

    const { result } = renderHook(() => {
      const [customerId, setCustomerId] = useState('');
      const [error, setError] = useState<string | null>(null);
      const [loading, setLoading] = useState(false);
      const hook = useInvoicesDataState({ customerId, setCustomerId, setError, setLoading });

      return { error, loading, ...hook };
    });

    await act(async () => {
      await result.current.fetchData();
    });

    expect(result.current.invoices).toHaveLength(2);

    act(() => {
      result.current.removeInvoiceFromState('invoice-1');
    });

    expect(result.current.invoices.map((invoice) => invoice.id)).toEqual(['invoice-2']);
  });

  it('patches one customer in state via updateCustomerInState without touching others', async () => {
    (listCustomers as jest.Mock).mockResolvedValue({
      data: [
        { id: 'customer-1', name: 'Acme', groupLineItemsByAgent: false },
        { id: 'customer-2', name: 'Beta', groupLineItemsByAgent: false },
      ],
      errors: undefined,
      nextToken: null,
    });
    (listCustomerUsers as jest.Mock).mockResolvedValue({ data: [] });
    (listAllRoutes as jest.Mock).mockResolvedValue({ data: [], errors: undefined, nextToken: null });
    (listInvoices as jest.Mock).mockResolvedValue({ data: [], errors: undefined, nextToken: null });

    const { result } = renderHook(() => {
      const [customerId, setCustomerId] = useState('');
      const [error, setError] = useState<string | null>(null);
      const [loading, setLoading] = useState(false);
      const hook = useInvoicesDataState({ customerId, setCustomerId, setError, setLoading });

      return { error, loading, ...hook };
    });

    await act(async () => {
      await result.current.fetchData();
    });

    act(() => {
      result.current.updateCustomerInState('customer-1', { groupLineItemsByAgent: true });
    });

    expect(result.current.customers.find((c) => c.id === 'customer-1')?.groupLineItemsByAgent).toBe(true);
    expect(result.current.customers.find((c) => c.id === 'customer-2')?.groupLineItemsByAgent).toBe(false);
  });
});