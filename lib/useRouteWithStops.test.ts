import { renderHook, act, waitFor } from '@testing-library/react';
import {
  EMPTY_ROUTE_WITH_STOPS,
  routeWithStopsReducer,
  routeWithStopsView,
  useRouteWithStops,
  type RouteWithStopsAction,
  type RouteWithStopsState,
} from '@/lib/useRouteWithStops';
import type { Route, Stop } from '@/amplify/types';

const mockGetRouteWithStops = jest.fn();
const mockRouteObserveQuery = jest.fn();
const mockStopObserveQuery = jest.fn();

jest.mock('@/lib/routes', () => ({
  getRouteWithStops: (...args: unknown[]) => mockGetRouteWithStops(...args),
}));

jest.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      Route: { observeQuery: (...args: unknown[]) => mockRouteObserveQuery(...args) },
      Stop: { observeQuery: (...args: unknown[]) => mockStopObserveQuery(...args) },
    },
  }),
}));

jest.mock('@/lib/amplify-config', () => ({
  configureAmplify: jest.fn(),
}));

type Subscriber = {
  next: (value: { items: unknown[]; isSynced: boolean }) => void;
  error: (err: unknown) => void;
};

function makeObservable() {
  let subscriber: Subscriber | null = null;
  const unsubscribe = jest.fn();
  return {
    observable: {
      subscribe: (sub: Subscriber) => {
        subscriber = sub;
        return { unsubscribe };
      },
    },
    emit: (value: { items: unknown[]; isSynced: boolean }) => subscriber?.next(value),
    emitError: (err: unknown) => subscriber?.error(err),
    unsubscribe,
  };
}

const T1 = '2026-09-26T09:00:00.000Z';
const T2 = '2026-09-26T09:05:00.000Z';
const T3 = '2026-09-26T09:10:00.000Z';

function route(fields: Partial<Route> = {}): Route {
  return { id: 'r1', customerId: 'c1', status: 'planned', updatedAt: T1, ...fields } as Route;
}

function stop(id: string, fields: Partial<Stop> = {}): Stop {
  return { id, routeId: 'r1', sequence: 1, updatedAt: T1, ...fields } as Stop;
}

function run(...actions: RouteWithStopsAction[]): RouteWithStopsState {
  return actions.reduce(routeWithStopsReducer, { ...EMPTY_ROUTE_WITH_STOPS, loading: true });
}

describe('routeWithStopsReducer', () => {
  it('a fetch gives first paint, stops in sequence order', () => {
    const state = run({ type: 'fetched', route: route(), stops: [stop('s2', { sequence: 2 }), stop('s1')] });

    expect(state.loading).toBe(false);
    expect(routeWithStopsView(state)).toEqual({
      route: route(),
      stops: [stop('s1'), stop('s2', { sequence: 2 })],
    });
  });

  it('a failed fetch reports the error', () => {
    const state = run({ type: 'fetchFailed', error: 'Failed to load route.' });
    expect(state).toMatchObject({ loading: false, error: 'Failed to load route.', route: null });
  });

  it('live changes replace what was fetched', () => {
    const state = run(
      { type: 'fetched', route: route(), stops: [stop('s1'), stop('s2', { sequence: 2 })] },
      { type: 'liveRoute', route: route({ status: 'in_progress', updatedAt: T2 }) },
      { type: 'liveStops', stops: [stop('s1', { notes: 'gate', updatedAt: T2 })] }
    );

    expect(routeWithStopsView(state)).toEqual({
      route: route({ status: 'in_progress', updatedAt: T2 }),
      stops: [stop('s1', { notes: 'gate', updatedAt: T2 })],
    });
  });

  it('a fetch landing after a newer live push keeps the newer records', () => {
    const state = run(
      { type: 'liveRoute', route: route({ status: 'in_progress', updatedAt: T2 }) },
      { type: 'liveStops', stops: [stop('s1', { notes: 'gate', updatedAt: T2 })] },
      { type: 'fetched', route: route(), stops: [stop('s1')] }
    );

    expect(routeWithStopsView(state)).toEqual({
      route: route({ status: 'in_progress', updatedAt: T2 }),
      stops: [stop('s1', { notes: 'gate', updatedAt: T2 })],
    });
  });

  it('a fetch that finds no route clears it', () => {
    const state = run({ type: 'fetched', route: route(), stops: [] }, { type: 'fetched', route: null, stops: [] });
    expect(state.route).toBeNull();
  });

  describe('route patches', () => {
    it('show over the fetched route', () => {
      const state = run(
        { type: 'fetched', route: route(), stops: [] },
        { type: 'patchRoute', patch: { customerInstructions: 'Ring first' } }
      );
      expect(routeWithStopsView(state).route).toEqual(route({ customerInstructions: 'Ring first' }));
    });

    it('stack', () => {
      const state = run(
        { type: 'fetched', route: route(), stops: [] },
        { type: 'patchRoute', patch: { customerFeedbackTone: 'good' } },
        { type: 'patchRoute', patch: { customerFeedbackNote: 'Great' } }
      );
      expect(routeWithStopsView(state).route).toMatchObject({ customerFeedbackTone: 'good', customerFeedbackNote: 'Great' });
    });

    it('survive a live push of the same version', () => {
      const state = run(
        { type: 'fetched', route: route(), stops: [] },
        { type: 'patchRoute', patch: { customerInstructions: 'Ring first' } },
        { type: 'liveRoute', route: route() }
      );
      expect(routeWithStopsView(state).route?.customerInstructions).toBe('Ring first');
    });

    it('drop once a newer version arrives live', () => {
      const state = run(
        { type: 'fetched', route: route(), stops: [] },
        { type: 'patchRoute', patch: { customerInstructions: 'Ring first' } },
        { type: 'liveRoute', route: route({ customerInstructions: 'Ring twice', updatedAt: T2 }) }
      );
      expect(state.routePatch).toBeNull();
      expect(routeWithStopsView(state).route?.customerInstructions).toBe('Ring twice');
    });

    it('drop on a fetch', () => {
      const state = run(
        { type: 'fetched', route: route(), stops: [] },
        { type: 'patchRoute', patch: { customerInstructions: 'Ring first' } },
        { type: 'fetched', route: route(), stops: [] }
      );
      expect(routeWithStopsView(state).route?.customerInstructions).toBeUndefined();
    });

    it('are ignored before there is a route', () => {
      const state = run({ type: 'patchRoute', patch: { status: 'completed' } });
      expect(state.routePatch).toBeNull();
    });
  });

  describe('stop patches', () => {
    const fetched: RouteWithStopsAction = {
      type: 'fetched',
      route: route(),
      stops: [stop('s1', { sequence: 1 }), stop('s2', { sequence: 2 })],
    };

    it('show over the fetched stops and re-sort them', () => {
      const state = run(
        fetched,
        { type: 'patchStop', id: 's1', patch: { sequence: 2 } },
        { type: 'patchStop', id: 's2', patch: { sequence: 1 } }
      );
      expect(routeWithStopsView(state).stops.map((s) => s.id)).toEqual(['s2', 's1']);
    });

    it('drop per stop as each newer version arrives live', () => {
      const state = run(
        fetched,
        { type: 'patchStop', id: 's1', patch: { sequence: 2 } },
        { type: 'patchStop', id: 's2', patch: { sequence: 1 } },
        { type: 'liveStops', stops: [stop('s1', { sequence: 2, updatedAt: T2 }), stop('s2', { sequence: 2 })] }
      );
      expect(Object.keys(state.stopPatches)).toEqual(['s2']);
      expect(routeWithStopsView(state).stops.map((s) => [s.id, s.sequence])).toEqual([
        ['s2', 1],
        ['s1', 2],
      ]);
    });

    it('drop when the stop is removed', () => {
      const state = run(
        fetched,
        { type: 'patchStop', id: 's2', patch: { notes: 'x' } },
        { type: 'liveStops', stops: [stop('s1', { updatedAt: T3 })] }
      );
      expect(state.stopPatches).toEqual({});
      expect(routeWithStopsView(state).stops).toEqual([stop('s1', { updatedAt: T3 })]);
    });

    it('are ignored for a stop not on the route', () => {
      const state = run(fetched, { type: 'patchStop', id: 'nope', patch: { notes: 'x' } });
      expect(state.stopPatches).toEqual({});
    });
  });
});

describe('useRouteWithStops', () => {
  let routeFeed: ReturnType<typeof makeObservable>;
  let stopFeed: ReturnType<typeof makeObservable>;

  beforeEach(() => {
    jest.clearAllMocks();
    routeFeed = makeObservable();
    stopFeed = makeObservable();
    mockRouteObserveQuery.mockReturnValue(routeFeed.observable);
    mockStopObserveQuery.mockReturnValue(stopFeed.observable);
    mockGetRouteWithStops.mockResolvedValue({ route: route(), stops: [stop('s1')], errors: [] });
  });

  it('paints from the fetch, then follows live Route and Stop changes', async () => {
    const { result } = renderHook(() => useRouteWithStops('r1'));
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.route).toEqual(route());
    expect(result.current.stops).toEqual([stop('s1')]);
    expect(mockRouteObserveQuery).toHaveBeenCalledWith({ filter: { id: { eq: 'r1' } } });
    expect(mockStopObserveQuery).toHaveBeenCalledWith({ filter: { routeId: { eq: 'r1' } } });

    act(() => {
      routeFeed.emit({ items: [route({ status: 'in_progress', updatedAt: T2 })], isSynced: true });
      stopFeed.emit({ items: [stop('s1', { updatedAt: T2 }), stop('s2', { sequence: 2, updatedAt: T2 })], isSynced: true });
    });

    expect(result.current.route?.status).toBe('in_progress');
    expect(result.current.stops.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('ignores unsynced snapshots, which can be partial', async () => {
    const { result } = renderHook(() => useRouteWithStops('r1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      stopFeed.emit({ items: [], isSynced: false });
      routeFeed.emit({ items: [route({ status: 'completed', updatedAt: T2 })], isSynced: false });
    });

    expect(result.current.stops).toEqual([stop('s1')]);
    expect(result.current.route?.status).toBe('planned');
  });

  it('keeps the fetched route when the live feed has none', async () => {
    const { result } = renderHook(() => useRouteWithStops('r1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => routeFeed.emit({ items: [], isSynced: true }));

    expect(result.current.route).toEqual(route());
  });

  it('reports a failed first fetch', async () => {
    mockGetRouteWithStops.mockResolvedValue({ route: null, stops: [], errors: [{ message: 'boom' }] });
    const { result } = renderHook(() => useRouteWithStops('r1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Failed to load route.');
  });

  it('resolves a missing route to null with no error', async () => {
    mockGetRouteWithStops.mockResolvedValue({ route: null, stops: [], errors: [] });
    const { result } = renderHook(() => useRouteWithStops('r1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ route: null, stops: [], error: null });
  });

  it('shows a patch until the write echoes back live', async () => {
    const { result } = renderHook(() => useRouteWithStops('r1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.patchRoute({ customerFeedbackTone: 'good' }));
    expect(result.current.route?.customerFeedbackTone).toBe('good');

    act(() => routeFeed.emit({ items: [route({ customerFeedbackTone: 'issue', updatedAt: T2 })], isSynced: true }));
    expect(result.current.route?.customerFeedbackTone).toBe('issue');
  });

  it('refetch() resyncs and settles patches; a failed refetch keeps what is shown', async () => {
    const { result } = renderHook(() => useRouteWithStops('r1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.patchStop('s1', { notes: 'optimistic' }));
    mockGetRouteWithStops.mockResolvedValue({ route: route(), stops: [stop('s1', { notes: 'saved', updatedAt: T2 })], errors: [] });
    await act(() => result.current.refetch());
    expect(result.current.stops[0].notes).toBe('saved');

    mockGetRouteWithStops.mockResolvedValue({ route: null, stops: [], errors: [{ message: 'boom' }] });
    await act(() => result.current.refetch());
    expect(result.current.stops[0].notes).toBe('saved');
    expect(result.current.error).toBeNull();
  });

  it('resubscribes on window focus and unsubscribes on unmount', async () => {
    const { result, unmount } = renderHook(() => useRouteWithStops('r1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(mockRouteObserveQuery).toHaveBeenCalledTimes(2);
    expect(mockStopObserveQuery).toHaveBeenCalledTimes(2);

    unmount();
    expect(routeFeed.unsubscribe).toHaveBeenCalledTimes(2);
    expect(stopFeed.unsubscribe).toHaveBeenCalledTimes(2);
  });

  it('logs a live feed error without disturbing what is shown', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const { result } = renderHook(() => useRouteWithStops('r1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => stopFeed.emitError(new Error('socket closed')));

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(result.current).toMatchObject({ route: route(), stops: [stop('s1')], error: null });
    consoleErrorSpy.mockRestore();
  });

  it('does nothing without a routeId', () => {
    const { result } = renderHook(() => useRouteWithStops(null));

    expect(result.current).toMatchObject({ route: null, stops: [], loading: false, error: null });
    expect(mockGetRouteWithStops).not.toHaveBeenCalled();
    expect(mockRouteObserveQuery).not.toHaveBeenCalled();
  });
});
