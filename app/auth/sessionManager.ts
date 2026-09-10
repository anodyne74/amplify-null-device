/**
 * Session Management Utilities
 * Handles session timeout, logout, and session validation
 */

import { useCallback, useEffect, useRef } from 'react';
import { signOut } from 'aws-amplify/auth';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const INACTIVITY_CHECK_INTERVAL_MS = 1000; // Check every second

/**
 * Hook to manage session timeout and logout
 * Logs out user after 30 minutes of inactivity
 */
export function useSessionTimeout() {
  const lastActivityRef = useRef<number>(Date.now());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Update last activity timestamp
   */
  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  /**
   * Handle session timeout - log out and redirect
   */
  const handleSessionTimeout = useCallback(async () => {
    // Clear the activity timestamp
    lastActivityRef.current = 0;

    // Sign out from Cognito
    await signOut();

    // Hard navigation, not router.push -- see useLogout() below for why.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/';
  }, []);

  /**
   * Check if session has timed out
   */
  const checkSessionTimeout = useCallback(() => {
    const timeSinceLastActivity = Date.now() - lastActivityRef.current;

    if (timeSinceLastActivity > SESSION_TIMEOUT_MS) {
      handleSessionTimeout();
    }
  }, [handleSessionTimeout]);

  /**
   * Cleanup timeout and interval on unmount
   */
  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
    }
  }, []);

  /**
   * Initialize session timeout monitoring
   */
  useEffect(() => {
    // Set up inactivity check interval
    checkIntervalRef.current = setInterval(checkSessionTimeout, INACTIVITY_CHECK_INTERVAL_MS);

    // Set up activity listeners
    const handleActivity = () => {
      updateActivity();
    };

    window.addEventListener('mousedown', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('scroll', handleActivity);
    window.addEventListener('touchstart', handleActivity);

    return () => {
      cleanup();
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('scroll', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
    };
  }, [checkSessionTimeout, updateActivity, cleanup]);

  return {
    handleSessionTimeout,
    updateActivity,
  };
}

/**
 * Hook for logout functionality
 * Provides a way to manually logout the user
 */
export function useLogout() {
  const logout = useCallback(async () => {
    try {
      // Call aws-amplify/auth's signOut() directly rather than the
      // signOut() exposed by useAuthenticator(). The latter is just
      // `send({ type: 'SIGN_OUT' })` -- a synchronous dispatch to the
      // Authenticator's XState machine that returns void, not a promise
      // tied to completion. `await`-ing it resolves on the next
      // microtask regardless of whether the machine's invoked signOut
      // service (which does the real work: revoking the refresh token,
      // clearing tokens from storage) has actually finished. The hard
      // navigation below then fires before that work completes, tearing
      // down the page mid-signOut and leaving the session tokens intact
      // in localStorage -- so the freshly loaded '/' reads a still-valid
      // session and redirects straight back into the portal, looking
      // like logout silently failed. Awaiting the real signOut() from
      // aws-amplify/auth guarantees storage is actually cleared first.
      await signOut();
    } catch (error) {
      console.error('Error during logout:', error);
    }
    // Hard navigation rather than router.push('/'): a client-side push
    // can land before every authStatus subscriber (root page, route
    // guards) has re-rendered with the new 'unauthenticated' snapshot,
    // so the freshly mounted root page reads a stale 'authenticated'
    // status and redirects straight back into the portal. A full
    // navigation always re-reads auth state fresh from storage.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/';
  }, []);

  return { logout };
}
