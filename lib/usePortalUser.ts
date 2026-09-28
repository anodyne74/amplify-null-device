'use client';

import { useEffect, useState } from 'react';
import { useCurrentUserId } from '@/lib/use-user-groups';
import { fetchUserDisplayName } from '@/lib/amplify-config';
import { getUserSettings } from '@/lib/userSettings';
import { useLogout } from '@/app/auth/sessionManager';

export interface PortalUser {
  /** The signed-in user's Cognito sub, once the session has loaded. */
  userId: string | undefined;
  /** The name saved in Settings, else the token's given_name/name, else ''. */
  displayName: string;
  logout: () => Promise<void>;
}

/**
 * The signed-in user as every portal shows them. The id comes from
 * useCurrentUserId, never useAuthenticator().user, which stays undefined after
 * the custom sign-in form. Both names are read before either is shown, so the
 * token name never flashes in before the saved one.
 */
export function usePortalUser(): PortalUser {
  const userId = useCurrentUserId();
  const { logout } = useLogout();
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    if (!userId) {
      setDisplayName('');
      return;
    }
    let cancelled = false;

    void Promise.all([
      getUserSettings(userId).then(
        (result) => result.data?.name?.trim(),
        () => undefined
      ),
      fetchUserDisplayName(),
    ]).then(([savedName, tokenName]) => {
      if (!cancelled) setDisplayName(savedName || tokenName || '');
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { userId, displayName, logout };
}
