import { act, renderHook, waitFor } from '@testing-library/react';
import type { Route } from '@/amplify/types';
import { useRoutesList } from '@/lib/useRoutesList';
import { listAllRoutes } from '@/lib/queries/ListAllRoutes';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';
import { deleteRoute } from '@/lib/queries';

jest.mock('@/lib/queries/ListAllRoutes', () => ({
  listAllRoutes: jest.fn(),
}));

jest.mock('@/lib/queries/ListAllCustomers', () => ({
  listAllCustomers: jest.fn(),
}));

jest.mock('@/lib/queries', () => ({
  deleteRoute: jest.fn(),
}));

describe('useRoutesList', () => {
  const mockRoutes: Route[] = [
    {
      id: 'route-2',
      customerId: 'customer-2',
      routeCode: 'W19-26-002',
      status: 'completed',
      createdAt: '2024-01-02T00:00:00Z',
    },
    {
      id: 'route-10',
      customerId: 'customer-1',
      routeCode: 'W19-26-010',
      status: 'planned',
      createdAt: '2024-01-03T00:00:00Z',
    },
    {
      id: 'route-1',
      customerId: 'customer-1',
      routeCode: 'W19-26-001',
      status: 'completed',
      createdAt: '2024-01-01T00:00:00Z',
    },
  ] as Route[];

  beforeEach(() => {
    jest.clearAllMocks();

    (listAllRoutes as jest.Mock).mockResolvedValue({
      data: mockRoutes,
      errors: undefined,
    });

    (listAllCustomers as jest.Mock).mockResolvedValue({
      data: [
        { id: 'customer-1', name: 'Acme Corp' },
        { id: 'customer-2', name: 'Globex Inc' },
      ],
      errors: undefined,
    });

    (deleteRoute as jest.Mock).mockResolvedValue({ data: {}, errors: undefined });

    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads routes/customers and sorts routes by id descending', async () => {
    const { result } = renderHook(() => useRoutesList(true));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.filteredRoutes.map((route) => route.id)).toEqual([
      'route-10',
      'route-2',
      'route-1',
    ]);
    expect(result.current.customersById).toEqual({
      'customer-1': 'Acme Corp',
      'customer-2': 'Globex Inc',
    });
  });

  it('surfaces loading error when route fetch fails', async () => {
    (listAllRoutes as jest.Mock).mockResolvedValue({
      data: [],
      errors: [{ message: 'network' }],
    });

    const { result } = renderHook(() => useRoutesList(true));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Failed to load routes.');
    expect(result.current.filteredRoutes).toHaveLength(0);
  });

  it('updates filtered routes when status filter changes', async () => {
    const { result } = renderHook(() => useRoutesList(true));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.setStatusFilter('completed');
    });

    expect(result.current.statusFilter).toBe('completed');
    expect(result.current.filteredRoutes.map((route) => route.id)).toEqual(['route-2', 'route-1']);
  });

  it('deletes a route when confirmed and permitted', async () => {
    const { result } = renderHook(() => useRoutesList(true));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const targetRoute = result.current.filteredRoutes.find((route) => route.id === 'route-2') as Route;

    await act(async () => {
      await result.current.handleDeleteRoute(targetRoute);
    });

    expect(deleteRoute).toHaveBeenCalledWith('route-2');
    expect(result.current.filteredRoutes.map((route) => route.id)).toEqual(['route-10', 'route-1']);
    expect(result.current.deletingRouteId).toBeNull();
  });

  it('does not delete route when user cannot delete', async () => {
    const { result } = renderHook(() => useRoutesList(false));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.handleDeleteRoute(result.current.filteredRoutes[0]);
    });

    expect(window.confirm).not.toHaveBeenCalled();
    expect(deleteRoute).not.toHaveBeenCalled();
  });

  it('surfaces delete error when delete call fails', async () => {
    (deleteRoute as jest.Mock).mockResolvedValue({
      data: null,
      errors: [{ message: 'delete failed' }],
    });

    const { result } = renderHook(() => useRoutesList(true));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const initialIds = result.current.filteredRoutes.map((route) => route.id);

    await act(async () => {
      await result.current.handleDeleteRoute(result.current.filteredRoutes[0]);
    });

    expect(deleteRoute).toHaveBeenCalled();
    expect(result.current.error).toBe('Failed to delete route.');
    expect(result.current.deletingRouteId).toBeNull();
    expect(result.current.filteredRoutes.map((route) => route.id)).toEqual(initialIds);
  });

  it('does not delete route when user cancels confirmation', async () => {
    (window.confirm as jest.Mock).mockReturnValue(false);

    const { result } = renderHook(() => useRoutesList(true));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const initialIds = result.current.filteredRoutes.map((route) => route.id);

    await act(async () => {
      await result.current.handleDeleteRoute(result.current.filteredRoutes[0]);
    });

    expect(window.confirm).toHaveBeenCalled();
    expect(deleteRoute).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
    expect(result.current.deletingRouteId).toBeNull();
    expect(result.current.filteredRoutes.map((route) => route.id)).toEqual(initialIds);
  });
});
