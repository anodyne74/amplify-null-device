import { renderHook, act, waitFor } from '@testing-library/react';
import { useSignRunPhaseScreen } from '@/lib/useSignRunPhaseScreen';
import type { RouteWithStopsFeedHandlers } from '@/lib/routeWithStopsFeed';
import type { Route, Stop } from '@/amplify/types';

const mockGetRouteWithStops = jest.fn();
const mockFeed: { handlers: RouteWithStopsFeedHandlers | null } = { handlers: null };

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'id' ? 'route-1' : null) }),
}));

jest.mock('@/lib/queries', () => ({
  getRouteWithStops: (...args: unknown[]) => mockGetRouteWithStops(...args),
}));

jest.mock('@/lib/routeWithStopsFeed', () => ({
  subscribeRouteWithStops: (_routeId: string, handlers: RouteWithStopsFeedHandlers) => {
    mockFeed.handlers = handlers;
    return () => {
      mockFeed.handlers = null;
    };
  },
}));

const placementRoute = {
  id: 'route-1',
  customerId: 'cust-1',
  status: 'in_progress',
  executionPhase: 'placement',
  placementStartTime: '2026-09-26T08:00:00.000Z',
  updatedAt: '2026-09-26T08:00:00.000Z',
} as Route;

const stops = [{ id: 's1', routeId: 'route-1', sequence: 1, updatedAt: '2026-09-26T08:00:00.000Z' } as Stop];

describe('useSignRunPhaseScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFeed.handlers = null;
    mockGetRouteWithStops.mockResolvedValue({ route: placementRoute, stops, errors: undefined });
  });

  it('stays loading until the extra data resolves, and fetches it once across live updates', async () => {
    let resolveExtra: (value: string) => void = () => {};
    const fetchExtra = jest.fn(() => new Promise<string>((resolve) => (resolveExtra = resolve)));

    const { result } = renderHook(() => useSignRunPhaseScreen({ phaseIdx: 1, fetchExtra }));

    await waitFor(() => expect(fetchExtra).toHaveBeenCalledTimes(1));
    expect(result.current.loading).toBe(true);

    await act(async () => resolveExtra('Beltline Group'));
    expect(result.current.loading).toBe(false);
    expect(result.current.extra).toBe('Beltline Group');
    expect(result.current.isOnPhase).toBe(true);

    act(() => mockFeed.handlers!.onRoute({ ...placementRoute, updatedAt: '2026-09-26T08:05:00.000Z' }));
    expect(fetchExtra).toHaveBeenCalledTimes(1);
  });

  it('finishes loading with no extra data when the extra fetch fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const fetchExtra = jest.fn().mockRejectedValue(new Error('customer read failed'));

    const { result } = renderHook(() => useSignRunPhaseScreen({ phaseIdx: 1, fetchExtra }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.extra).toBeNull();
    expect(result.current.isOnPhase).toBe(true);
  });

  it('leaves the phase when the live route moves on', async () => {
    const { result } = renderHook(() => useSignRunPhaseScreen({ phaseIdx: 1 }));
    await waitFor(() => expect(result.current.isOnPhase).toBe(true));

    act(() =>
      mockFeed.handlers!.onRoute({
        ...placementRoute,
        executionPhase: 'pickup',
        placementEndTime: '2026-09-26T09:00:00.000Z',
        updatedAt: '2026-09-26T09:00:00.000Z',
      })
    );

    expect(result.current.isOnPhase).toBe(false);
  });

  it("shows a write's result straight away through patchRoute", async () => {
    const { result } = renderHook(() => useSignRunPhaseScreen({ phaseIdx: 1 }));
    await waitFor(() => expect(result.current.isOnPhase).toBe(true));

    act(() => result.current.patchRoute({ placementEndTime: '2026-09-26T09:00:00.000Z', executionPhase: 'pickup' }));

    expect(result.current.route?.executionPhase).toBe('pickup');
    expect(result.current.isOnPhase).toBe(false);
  });
});
