import { renderHook, act } from '@testing-library/react';
import { useLiveRoutes, useLiveAllRoutes, useLiveOperatorRoutes } from '@/lib/useLiveRoutes';
import { signRunOutbox } from '@/lib/signRunOutbox';

const mockObserveQuery = jest.fn();

jest.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      Route: {
        observeQuery: (...args: unknown[]) => mockObserveQuery(...args),
      },
    },
  }),
}));

jest.mock('@/lib/amplify-config', () => ({
  configureAmplify: jest.fn(),
}));

// Outbox writes hang: an unsaved write stays unsaved for the whole test.
jest.mock('@/lib/routes', () => ({
  updateRoute: () => new Promise(() => {}),
  updateStopExecution: () => new Promise(() => {}),
}));

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/lib/apiClient', () => ({ callApi: jest.fn().mockResolvedValue({}) }));

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

describe('useLiveRoutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts in a loading state and stays empty without a customerId', () => {
    const { result } = renderHook(() => useLiveRoutes(null));

    expect(result.current.routes).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(mockObserveQuery).not.toHaveBeenCalled();
  });

  it('subscribes with a customerId filter and reflects the initial sync', () => {
    const feed = makeObservable();
    mockObserveQuery.mockReturnValue(feed.observable);

    const { result } = renderHook(() => useLiveRoutes('cust-1'));

    expect(mockObserveQuery).toHaveBeenCalledWith({ filter: { customerId: { eq: 'cust-1' } } });
    expect(result.current.loading).toBe(true);

    act(() => {
      feed.emit({ items: [{ id: 'route-1', status: 'planned' }], isSynced: true });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.routes).toEqual([{ id: 'route-1', status: 'planned' }]);
  });

  it('reflects a subsequent status change pushed over the same subscription', () => {
    const feed = makeObservable();
    mockObserveQuery.mockReturnValue(feed.observable);

    const { result } = renderHook(() => useLiveRoutes('cust-1'));

    act(() => {
      feed.emit({ items: [{ id: 'route-1', status: 'planned' }], isSynced: true });
    });
    act(() => {
      feed.emit({ items: [{ id: 'route-1', status: 'signs_placed' }], isSynced: true });
    });

    expect(result.current.routes).toEqual([{ id: 'route-1', status: 'signs_placed' }]);
  });

  it('surfaces a subscription error', () => {
    const feed = makeObservable();
    mockObserveQuery.mockReturnValue(feed.observable);

    const { result } = renderHook(() => useLiveRoutes('cust-1'));

    act(() => {
      feed.emitError(new Error('connection lost'));
    });

    expect(result.current.error).toBe('connection lost');
    expect(result.current.loading).toBe(false);
  });

  it('resubscribes when the window regains focus, resyncing after a dropped connection', () => {
    const firstFeed = makeObservable();
    const secondFeed = makeObservable();
    mockObserveQuery.mockReturnValueOnce(firstFeed.observable).mockReturnValueOnce(secondFeed.observable);

    const { result } = renderHook(() => useLiveRoutes('cust-1'));

    act(() => {
      firstFeed.emit({ items: [{ id: 'route-1', status: 'planned' }], isSynced: true });
    });
    expect(result.current.routes).toEqual([{ id: 'route-1', status: 'planned' }]);

    // Simulate the realtime connection silently dropping (no error, no
    // update pushed) while the route's status actually changed server-side.
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(firstFeed.unsubscribe).toHaveBeenCalledTimes(1);
    expect(mockObserveQuery).toHaveBeenCalledTimes(2);

    act(() => {
      secondFeed.emit({ items: [{ id: 'route-1', status: 'signs_placed' }], isSynced: true });
    });

    expect(result.current.routes).toEqual([{ id: 'route-1', status: 'signs_placed' }]);
  });

  it('unsubscribes on unmount', () => {
    const feed = makeObservable();
    mockObserveQuery.mockReturnValue(feed.observable);

    const { unmount } = renderHook(() => useLiveRoutes('cust-1'));
    unmount();

    expect(feed.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('useLiveAllRoutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // observeQuery hands back the same array every time, growing it page by
  // page and on each live event.
  it('shows every page and live event, though observeQuery reuses one array', () => {
    const feed = makeObservable();
    mockObserveQuery.mockReturnValue(feed.observable);
    const items: unknown[] = [{ id: 'route-1' }];

    const { result } = renderHook(() => useLiveAllRoutes());
    act(() => {
      feed.emit({ items, isSynced: false });
    });
    expect(result.current.routes.map((route) => route.id)).toEqual(['route-1']);

    act(() => {
      items.push({ id: 'route-2' });
      feed.emit({ items, isSynced: true });
    });
    expect(result.current.routes.map((route) => route.id)).toEqual(['route-1', 'route-2']);

    act(() => {
      items[0] = { id: 'route-1', status: 'in_progress' };
      feed.emit({ items, isSynced: true });
    });
    expect(result.current.routes[0].status).toBe('in_progress');
  });

  it('subscribes without a filter and reflects the initial sync', () => {
    const feed = makeObservable();
    mockObserveQuery.mockReturnValue(feed.observable);

    const { result } = renderHook(() => useLiveAllRoutes());

    expect(mockObserveQuery).toHaveBeenCalledWith({});
    expect(result.current.loading).toBe(true);

    act(() => {
      feed.emit({ items: [{ id: 'route-1' }, { id: 'route-2' }], isSynced: true });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.routes).toEqual([{ id: 'route-1' }, { id: 'route-2' }]);
  });

  it('shows the dashboard an unsaved Complete Placement as Pickup (#355)', async () => {
    const feed = makeObservable();
    mockObserveQuery.mockReturnValue(feed.observable);
    const { result } = renderHook(() => useLiveAllRoutes());
    act(() => {
      feed.emit({ items: [{ id: 'route-1', executionPhase: 'placement', updatedAt: '2026-09-30T09:00:00.000Z' }], isSynced: true });
    });

    act(() => {
      signRunOutbox.enqueue({
        routeId: 'route-1',
        target: 'Route',
        recordId: 'route-1',
        kind: 'completePlacement',
        patch: { executionPhase: 'pickup' },
      });
    });

    expect(result.current.routes[0].executionPhase).toBe('pickup');
    await act(() => signRunOutbox.discardAll());
    expect(result.current.routes[0].executionPhase).toBe('placement');
  });

  it('reflects a route newly appearing (e.g. a new assignment) pushed over the same subscription', () => {
    const feed = makeObservable();
    mockObserveQuery.mockReturnValue(feed.observable);

    const { result } = renderHook(() => useLiveAllRoutes());

    act(() => {
      feed.emit({ items: [{ id: 'route-1' }], isSynced: true });
    });
    act(() => {
      feed.emit({ items: [{ id: 'route-1' }, { id: 'route-2' }], isSynced: true });
    });

    expect(result.current.routes).toEqual([{ id: 'route-1' }, { id: 'route-2' }]);
  });

  it('surfaces a subscription error', () => {
    const feed = makeObservable();
    mockObserveQuery.mockReturnValue(feed.observable);

    const { result } = renderHook(() => useLiveAllRoutes());

    act(() => {
      feed.emitError(new Error('connection lost'));
    });

    expect(result.current.error).toBe('connection lost');
    expect(result.current.loading).toBe(false);
  });

  it('resubscribes when the window regains focus, resyncing after a dropped connection', () => {
    const firstFeed = makeObservable();
    const secondFeed = makeObservable();
    mockObserveQuery.mockReturnValueOnce(firstFeed.observable).mockReturnValueOnce(secondFeed.observable);

    renderHook(() => useLiveAllRoutes());

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(firstFeed.unsubscribe).toHaveBeenCalledTimes(1);
    expect(mockObserveQuery).toHaveBeenCalledTimes(2);
  });

  it('unsubscribes on unmount', () => {
    const feed = makeObservable();
    mockObserveQuery.mockReturnValue(feed.observable);

    const { unmount } = renderHook(() => useLiveAllRoutes());
    unmount();

    expect(feed.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('useLiveOperatorRoutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts idle and does not subscribe without an operatorSub', () => {
    const { result } = renderHook(() => useLiveOperatorRoutes(null));

    expect(result.current.routes).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(mockObserveQuery).not.toHaveBeenCalled();
  });

  it('subscribes with an assignedOperatorSub filter and reflects the initial sync', () => {
    const feed = makeObservable();
    mockObserveQuery.mockReturnValue(feed.observable);

    const { result } = renderHook(() => useLiveOperatorRoutes('op-1'));

    expect(mockObserveQuery).toHaveBeenCalledWith({ filter: { assignedOperatorSub: { eq: 'op-1' } } });

    act(() => {
      feed.emit({ items: [{ id: 'route-1', assignedOperatorSub: 'op-1' }], isSynced: true });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.routes).toEqual([{ id: 'route-1', assignedOperatorSub: 'op-1' }]);
  });
});
