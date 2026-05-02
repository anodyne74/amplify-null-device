'use client';

import { useState, useEffect } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { fetchUserGroups } from './amplify-config';

export interface UserGroupState {
  groups: string[];
  /** True while authStatus is configuring or the session fetch is in flight */
  loading: boolean;
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
      setFetched(true);
    }
  }, [authStatus]);

  const loading = authStatus === 'configuring' || (authStatus === 'authenticated' && !fetched);

  return {
    groups,
    loading,
    isAdmin: groups.includes('administrator'),
    isOperator: groups.includes('operator') || groups.includes('administrator'),
    isCustomer: groups.includes('customer'),
  };
}
