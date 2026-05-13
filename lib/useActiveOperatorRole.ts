'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUserGroups } from './use-user-groups';

export type OperatorRole = 'operator' | 'administrator';

/**
 * Hook to determine the active operator role based on user selection preference.
 * For users with both operator and administrator roles, this allows them to
 * choose which role experience to use at login.
 *
 * Selection is stored in localStorage and persists across sessions.
 * Falls back to Cognito group check if no preference is stored.
 *
 * Returns:
 * - activeRole: 'operator' | 'administrator' | null
 *   - 'operator': User has selected or been defaulted to operator experience
 *   - 'administrator': User has selected administrator experience
 *   - null: User is not in either role, or SSR is in progress
 * - isOperatorMode: boolean - true if activeRole === 'operator'
 */
export function useActiveOperatorRole(): {
  activeRole: OperatorRole | null;
  isOperatorMode: boolean;
} {
  const { groups, loading } = useUserGroups();
  const [storedRole, setStoredRole] = useState<OperatorRole | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  const hasAdminGroup = groups.includes('administrator');
  const hasOperatorGroup = groups.includes('operator');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    // Read persisted role preference once on client mount.
    const stored = localStorage.getItem('selectedOperatorRole') as OperatorRole | null;
    if (stored === 'operator' || stored === 'administrator') {
      setStoredRole(stored);
    }

    setIsHydrated(true);
  }, []);

  const activeRole = useMemo<OperatorRole | null>(() => {
    if (!isHydrated || loading) {
      return null;
    }

    // Only dual-group users can choose between operator/admin experiences.
    if (hasAdminGroup && hasOperatorGroup) {
      return storedRole ?? 'operator';
    }

    // Admin-only users must always see the administrator portal.
    if (hasAdminGroup) {
      return 'administrator';
    }

    if (hasOperatorGroup) {
      return 'operator';
    }

    return null;
  }, [hasAdminGroup, hasOperatorGroup, isHydrated, loading, storedRole]);

  return {
    activeRole,
    isOperatorMode: activeRole === 'operator',
  };
}
