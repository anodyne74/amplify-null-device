/**
 * Session Management Utilities
 * Handles session timeout, logout, and session validation
 */

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const INACTIVITY_CHECK_INTERVAL_MS = 1000; // Check every second

/**
 * Hook to manage session timeout and logout
 * Logs out user after 30 minutes of inactivity
 */
export function useSessionTimeout() {
  const router = useRouter();
  const { signOut } = useAuthenticator();
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

    // Redirect to login page
    router.push('/');
  }, [signOut, router]);

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
  const router = useRouter();
  const { signOut } = useAuthenticator();

  const logout = useCallback(async () => {
    try {
      await signOut();
      router.push('/');
    } catch (error) {
      console.error('Error during logout:', error);
    }
  }, [signOut, router]);

  return { logout };
}
