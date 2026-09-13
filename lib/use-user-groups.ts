'use client';

import { useState, useEffect } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { fetchUserGroups, fetchUserId } from './amplify-config';

export interface UserGroupState {
  groups: string[];
  /** True while authStatus is configuring or the session fetch is in flight */
  loading: boolean;
  isPending: boolean;
  isAdmin: boolean;
  isOperator: boolean;
  isCustomer: boolean;
}

/**
 * Amplify v6-compatible hook to read the current user's Cognito groups.
 *
 * Uses fetchAuthSession() under the hood (cached, no extra network calls)
 * so it works correctly with @aws-amplify/ui-react v6 where the `user`
 * object from useAuthenticator no longer carries token claims.
 */
export function useUserGroups(): UserGroupState {
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);
  const [groups, setGroups] = useState<string[]>([]);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (authStatus === 'authenticated') {
      setFetched(false);
      fetchUserGroups().then((g) => {
        setGroups(g);
        setFetched(true);
      });
    } else if (authStatus === 'unauthenticated') {
      setGroups([]);
      setFetched(false);
    }
  }, [authStatus]);

  const loading = authStatus === 'configuring' || (authStatus === 'authenticated' && !fetched);

  return {
    groups,
    loading,
    isPending: groups.length === 0,
    isAdmin: groups.includes('administrator'),
    isOperator: groups.includes('operator'),
    isCustomer: groups.includes('customer'),
  };
}

/**
 * Amplify v6-compatible way to read the current user's id (Cognito sub).
 *
 * Do not use `useAuthenticator().user?.userId` for this -- that field is only
 * populated by the Authenticator machine's own internal actors, so it stays
 * `undefined` for the entire session after this app's custom sign-in form
 * (app/page.tsx) calls `signIn()` directly, until a full page reload. See
 * fetchUserId() in lib/amplify-config.ts for details. This hook uses the same
 * authStatus-gated fetchAuthSession() approach as useUserGroups() above,
 * which is unaffected by that issue.
 */
export function useCurrentUserId(): string | undefined {
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);
  const [userId, setUserId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (authStatus === 'authenticated') {
      fetchUserId().then(setUserId);
    } else if (authStatus === 'unauthenticated') {
      setUserId(undefined);
    }
  }, [authStatus]);

  return userId;
}
