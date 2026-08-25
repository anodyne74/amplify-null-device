import { renderHook, act } from '@testing-library/react';
import { useIsNarrowViewport } from './useIsNarrowViewport';

function mockMatchMedia(initialMatches: boolean) {
  let changeListener: ((event: MediaQueryListEvent) => void) | undefined;

  const mql = {
    matches: initialMatches,
    media: '',
    addEventListener: jest.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
      if (event === 'change') changeListener = listener;
    }),
    removeEventListener: jest.fn(),
  };

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({ ...mql, media: query })),
  });

  return {
    fireChange: (matches: boolean) => {
      mql.matches = matches;
      changeListener?.({ matches } as MediaQueryListEvent);
    },
  };
}

describe('useIsNarrowViewport', () => {
  afterEach(() => {
    // @ts-expect-error -- test cleanup of a property we defined ourselves
    delete window.matchMedia;
  });

  it('defaults to false when matchMedia is unavailable', () => {
    // @ts-expect-error -- simulate an environment without matchMedia
    delete window.matchMedia;
    const { result } = renderHook(() => useIsNarrowViewport(900));
    expect(result.current).toBe(false);
  });

  it('reflects the initial match state', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsNarrowViewport(900));
    expect(result.current).toBe(true);
  });

  it('updates when the media query change event fires', () => {
    const { fireChange } = mockMatchMedia(false);
    const { result } = renderHook(() => useIsNarrowViewport(900));
    expect(result.current).toBe(false);

    act(() => {
      fireChange(true);
    });

    expect(result.current).toBe(true);
  });
});
