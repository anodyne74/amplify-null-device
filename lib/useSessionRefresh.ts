'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { fetchAuthSession } from 'aws-amplify/auth';

/**
 * Keeps the operator's Cognito session fresh ahead of Sign Run writes (#354,
 * ADR 0007).
 *
 * Amplify only refreshes the 60-minute tokens once a request finds them within
 * seconds of expiry, so the refresh runs in front of the write that needed it.
 * On a phone switching networks that has stalled a phase tap for 20-30s
 * (#266). Refreshing at the moments a stale token is most likely (a screen
 * loading, the app coming back into view, the device coming back online, and
 * before queued writes are resent) moves that wait off the operator's tap.
 *
 * No timers: nothing runs while the phone sits idle.
 */

// Refresh when either token expires within this. Long enough that a tap soon
// after a trigger finds a token with time left on it.
const STALE_WITHIN_MS = 10 * 60 * 1000;

let inFlight: Promise<void> | null = null;

function expiresSoon(exp: number | undefined) {
  return exp === undefined || exp * 1000 - Date.now() < STALE_WITHIN_MS;
}

async function refreshIfStale() {
  // Reads the cached tokens; Amplify refreshes them itself only if already expired.
  const { tokens } = await fetchAuthSession();
  if (!tokens) return;
  if (expiresSoon(tokens.idToken?.payload.exp) || expiresSoon(tokens.accessToken.payload.exp)) {
    await fetchAuthSession({ forceRefresh: true });
  }
}

/**
 * Refreshes the session if its tokens are expired or about to be. Calls that
 * overlap share one refresh. Never rejects: a failed refresh is left for the
 * next real request to retry, as it would be without this.
 */
export function refreshSessionIfStale(): Promise<void> {
  if (!inFlight) {
    inFlight = refreshIfStale()
      .catch(() => undefined)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Wires refreshSessionIfStale to screen loads, visibility and reconnects. Mount once. */
export function useSessionRefresh() {
  const pathname = usePathname();

  useEffect(() => {
    void refreshSessionIfStale();
  }, [pathname]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshSessionIfStale();
    };
    const onOnline = () => void refreshSessionIfStale();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, []);
}
