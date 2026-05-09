'use client';

import { useEffect, useState } from 'react';
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
  const { isAdmin, isOperator, loading } = useUserGroups();
  const [activeRole, setActiveRole] = useState<OperatorRole | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Read localStorage preference on client mount
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('selectedOperatorRole') as OperatorRole | null;

      if (stored === 'operator' || stored === 'administrator') {
        // Stored preference exists; use it
        setActiveRole(stored);
      } else if (!loading) {
        // No stored preference; fall back to Cognito groups
        if (isAdmin && isOperator) {
          // Both roles; require explicit selection (shouldn't reach here if home page
          // selector working correctly, but default to operator as fallback)
          setActiveRole('operator');
        } else if (isAdmin) {
          // Admin only
          setActiveRole('administrator');
        } else if (isOperator) {
          // Operator only
          setActiveRole('operator');
        } else {
          // Neither role
          setActiveRole(null);
        }
      }

      setIsHydrated(true);
    }
  }, [isAdmin, isOperator, loading]);

  return {
    activeRole: isHydrated ? activeRole : null,
    isOperatorMode: activeRole === 'operator',
  };
}
