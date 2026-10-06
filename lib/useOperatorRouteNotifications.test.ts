import { renderHook } from '@testing-library/react';
import type { Route } from '@/amplify/types';
import { useOperatorRouteNotifications } from '@/lib/useOperatorRouteNotifications';
import { useLiveOperatorRoutes } from '@/lib/useLiveRoutes';
import { useToast } from '@/app/components/ToastProvider';

jest.mock('@/lib/useLiveRoutes', () => ({
  useLiveOperatorRoutes: jest.fn(),
}));

jest.mock('@/app/components/ToastProvider', () => ({
  useToast: jest.fn(),
}));

function route(overrides: Partial<Route>): Route {
  return {
    id: 'route-1',
    routeCode: 'W25-08-100',
    customerId: 'cust-1',
    status: 'planned',
    ...overrides,
  } as Route;
}

describe('useOperatorRouteNotifications', () => {
  const showToast = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useToast as jest.Mock).mockReturnValue({ showToast });
  });

  it('does not toast for routes already assigned when the subscription first syncs', () => {
    (useLiveOperatorRoutes as jest.Mock).mockReturnValue({
      routes: [route({ id: 'route-1' })],
      loading: false,
      error: null,
    });

    renderHook(() => useOperatorRouteNotifications('op-1'));

    expect(showToast).not.toHaveBeenCalled();
  });

  it('toasts when a route becomes newly assigned after the initial sync', () => {
    (useLiveOperatorRoutes as jest.Mock).mockReturnValue({ routes: [], loading: false, error: null });
    const { rerender } = renderHook(() => useOperatorRouteNotifications('op-1'));

    (useLiveOperatorRoutes as jest.Mock).mockReturnValue({
      routes: [route({ id: 'route-2', routeCode: 'W25-08-102' })],
      loading: false,
      error: null,
    });
    rerender();

    expect(showToast).toHaveBeenCalledWith('Route W25-08-102 has been assigned to you');
  });

  it('toasts when customer instructions change on an already-assigned route', () => {
    (useLiveOperatorRoutes as jest.Mock).mockReturnValue({
      routes: [route({ id: 'route-1', customerInstructions: '' })],
      loading: false,
      error: null,
    });
    const { rerender } = renderHook(() => useOperatorRouteNotifications('op-1'));

    (useLiveOperatorRoutes as jest.Mock).mockReturnValue({
      routes: [route({ id: 'route-1', customerInstructions: '{"v":1,"entries":[]}' })],
      loading: false,
      error: null,
    });
    rerender();

    expect(showToast).toHaveBeenCalledWith('New instructions on route W25-08-100');
  });

  it('does not toast when an unrelated route field changes', () => {
    (useLiveOperatorRoutes as jest.Mock).mockReturnValue({
      routes: [route({ id: 'route-1', status: 'planned' })],
      loading: false,
      error: null,
    });
    const { rerender } = renderHook(() => useOperatorRouteNotifications('op-1'));

    (useLiveOperatorRoutes as jest.Mock).mockReturnValue({
      routes: [route({ id: 'route-1', status: 'signs_placed' })],
      loading: false,
      error: null,
    });
    rerender();

    expect(showToast).not.toHaveBeenCalled();
  });

  it('does not toast for a route that disappears (unassigned from this operator)', () => {
    (useLiveOperatorRoutes as jest.Mock).mockReturnValue({
      routes: [route({ id: 'route-1' })],
      loading: false,
      error: null,
    });
    const { rerender } = renderHook(() => useOperatorRouteNotifications('op-1'));

    (useLiveOperatorRoutes as jest.Mock).mockReturnValue({ routes: [], loading: false, error: null });
    rerender();

    expect(showToast).not.toHaveBeenCalled();
  });

  it('re-establishes a silent baseline after a reconnect (loading flips back to true)', () => {
    (useLiveOperatorRoutes as jest.Mock).mockReturnValue({
      routes: [route({ id: 'route-1' })],
      loading: false,
      error: null,
    });
    const { rerender } = renderHook(() => useOperatorRouteNotifications('op-1'));

    // Connection drops and resyncs — a route was reassigned to this operator
    // while disconnected, but that shouldn't retroactively toast.
    (useLiveOperatorRoutes as jest.Mock).mockReturnValue({ routes: [], loading: true, error: null });
    rerender();
    (useLiveOperatorRoutes as jest.Mock).mockReturnValue({
      routes: [route({ id: 'route-1' }), route({ id: 'route-2', routeCode: 'W25-08-102' })],
      loading: false,
      error: null,
    });
    rerender();

    expect(showToast).not.toHaveBeenCalled();
  });

  it('does nothing when there is no signed-in operator', () => {
    (useLiveOperatorRoutes as jest.Mock).mockReturnValue({ routes: [], loading: false, error: null });

    renderHook(() => useOperatorRouteNotifications(null));

    expect(useLiveOperatorRoutes).toHaveBeenCalledWith(null);
    expect(showToast).not.toHaveBeenCalled();
  });
});
