'use client';

import { useEffect, useState } from 'react';

/**
 * Tracks whether the viewport is at or below maxWidthPx, via matchMedia.
 * Defaults to false (desktop) when matchMedia isn't available (SSR, or
 * unmocked in tests) — same guard pattern as AmplifyThemeProvider's
 * getSystemPrefersLight, so components using this default to their
 * desktop rendering path unless a test explicitly mocks a narrow match.
 */
export function useIsNarrowViewport(maxWidthPx: number): boolean {
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const query = window.matchMedia(`(max-width: ${maxWidthPx}px)`);
    setIsNarrow(query.matches);

    const listener = (event: MediaQueryListEvent) => setIsNarrow(event.matches);

    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', listener);
      return () => query.removeEventListener('change', listener);
    }

    if (typeof query.addListener === 'function') {
      query.addListener(listener);
      return () => query.removeListener(listener);
    }

    return undefined;
  }, [maxWidthPx]);

  return isNarrow;
}
