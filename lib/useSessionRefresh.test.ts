import { act, renderHook } from '@testing-library/react';

const mockFetchAuthSession = jest.fn();
let mockPathname = '/operator/dashboard';

jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: (...args: unknown[]) => mockFetchAuthSession(...args),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

import { refreshSessionIfStale, useSessionRefresh } from '@/lib/useSessionRefresh';

const NOW = new Date('2026-09-30T09:00:00.000Z').getTime();
const MINUTE = 60 * 1000;

function sessionExpiringIn(ms: number) {
  const exp = Math.floor((NOW + ms) / 1000);
  return { tokens: { idToken: { payload: { exp } }, accessToken: { payload: { exp } } } };
}

const forcedRefreshes = () => mockFetchAuthSession.mock.calls.filter(([options]) => options?.forceRefresh).length;

/** Lets the in-flight refresh settle. */
const settle = () => act(async () => {});

describe('refreshSessionIfStale', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('forces a refresh when the tokens expire soon', async () => {
    mockFetchAuthSession.mockResolvedValue(sessionExpiringIn(2 * MINUTE));

    await refreshSessionIfStale();

    expect(forcedRefreshes()).toBe(1);
  });

  it('does not refresh fresh tokens', async () => {
    mockFetchAuthSession.mockResolvedValue(sessionExpiringIn(45 * MINUTE));

    await refreshSessionIfStale();

    expect(mockFetchAuthSession).toHaveBeenCalledTimes(1);
    expect(forcedRefreshes()).toBe(0);
  });

  it('refreshes when only the access token is near expiry', async () => {
    const session = sessionExpiringIn(45 * MINUTE);
    session.tokens.accessToken.payload.exp = Math.floor((NOW + MINUTE) / 1000);
    mockFetchAuthSession.mockResolvedValue(session);

    await refreshSessionIfStale();

    expect(forcedRefreshes()).toBe(1);
  });

  it('does nothing when signed out', async () => {
    mockFetchAuthSession.mockResolvedValue({ tokens: undefined });

    await refreshSessionIfStale();

    expect(forcedRefreshes()).toBe(0);
  });

  it('shares one refresh between overlapping calls', async () => {
    let finishRefresh!: () => void;
    mockFetchAuthSession.mockImplementation((options?: { forceRefresh?: boolean }) =>
      options?.forceRefresh
        ? new Promise((resolve) => (finishRefresh = () => resolve(sessionExpiringIn(60 * MINUTE))))
        : Promise.resolve(sessionExpiringIn(MINUTE))
    );

    const first = refreshSessionIfStale();
    const second = refreshSessionIfStale();
    await settle();
    const third = refreshSessionIfStale();
    finishRefresh();
    await Promise.all([first, second, third]);

    expect(forcedRefreshes()).toBe(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('starts a new refresh once the last one has finished', async () => {
    mockFetchAuthSession.mockResolvedValue(sessionExpiringIn(MINUTE));

    await refreshSessionIfStale();
    await refreshSessionIfStale();

    expect(forcedRefreshes()).toBe(2);
  });

  it('swallows a failed refresh', async () => {
    mockFetchAuthSession
      .mockResolvedValueOnce(sessionExpiringIn(MINUTE))
      .mockRejectedValueOnce(new Error('NetworkError'));

    await expect(refreshSessionIfStale()).resolves.toBeUndefined();
  });

  it('swallows a failed token read', async () => {
    mockFetchAuthSession.mockRejectedValue(new Error('NotAuthorizedException'));

    await expect(refreshSessionIfStale()).resolves.toBeUndefined();
  });
});

describe('useSessionRefresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    mockPathname = '/operator/dashboard';
    mockFetchAuthSession.mockResolvedValue(sessionExpiringIn(MINUTE));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  function setVisibility(state: DocumentVisibilityState) {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  }

  it('refreshes when the screen loads, and again on moving to another screen', async () => {
    const { rerender } = renderHook(() => useSessionRefresh());
    await settle();
    expect(forcedRefreshes()).toBe(1);

    mockPathname = '/operator/routes/placement';
    rerender();
    await settle();
    expect(forcedRefreshes()).toBe(2);
  });

  it('refreshes when the app becomes visible, not when it is hidden', async () => {
    renderHook(() => useSessionRefresh());
    await settle();
    mockFetchAuthSession.mockClear();

    setVisibility('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await settle();
    expect(mockFetchAuthSession).not.toHaveBeenCalled();

    setVisibility('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await settle();
    expect(forcedRefreshes()).toBe(1);
  });

  it('refreshes when the device comes back online', async () => {
    renderHook(() => useSessionRefresh());
    await settle();
    mockFetchAuthSession.mockClear();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await settle();

    expect(forcedRefreshes()).toBe(1);
  });

  it('does not refresh fresh tokens on any trigger', async () => {
    mockFetchAuthSession.mockResolvedValue(sessionExpiringIn(45 * MINUTE));
    renderHook(() => useSessionRefresh());
    await settle();
    setVisibility('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('online'));
    });
    await settle();

    expect(forcedRefreshes()).toBe(0);
  });

  it('coalesces triggers that fire together into one refresh', async () => {
    renderHook(() => useSessionRefresh());
    setVisibility('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('online'));
    });
    await settle();

    expect(forcedRefreshes()).toBe(1);
  });

  it('starts no timers', async () => {
    // Fake timers replace Date too, so pin their clock to NOW.
    jest.useFakeTimers({ now: NOW });
    renderHook(() => useSessionRefresh());
    setVisibility('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('online'));
    });
    // Not settle(): an async act() leaves a timer of its own.
    for (let i = 0; i < 10; i++) await Promise.resolve();

    expect(forcedRefreshes()).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('stops listening once unmounted', async () => {
    const { unmount } = renderHook(() => useSessionRefresh());
    await settle();
    unmount();
    mockFetchAuthSession.mockClear();

    window.dispatchEvent(new Event('online'));
    await settle();

    expect(mockFetchAuthSession).not.toHaveBeenCalled();
  });
});
