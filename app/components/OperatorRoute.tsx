'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useUserGroups } from '@/lib/use-user-groups';
import { useActiveOperatorRole } from '@/lib/useActiveOperatorRole';
import LoadingSpinner from './LoadingSpinner';

/**
 * OperatorRoute Component
 * Restricts access to authenticated operators only
 * For admin-only routes (requireAdmin=true), checks user's selected role preference
 * Redirects non-operators to customer portal, operator-mode users to operator dashboard
 */
export default function OperatorRoute({
  children,
  requireAdmin = false,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
}) {
  const router = useRouter();
  const { authStatus } = useAuthenticator();
  const { loading, isOperator } = useUserGroups();
  const { activeRole } = useActiveOperatorRole();

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/');
      return;
    }

    if (authStatus === 'authenticated' && !loading) {
      // If no role determined yet, user is not in operator/admin groups
      if (activeRole === null) {
        router.push('/customer/dashboard');
        return;
      }

      // Check if user can access this route
      if (requireAdmin) {
        // Admin-only route: require administrator role selection
        if (activeRole !== 'administrator') {
          router.push('/operator/dashboard');
        }
      } else {
        // Operator route: require operator or administrator role
        if (!isOperator) {
          router.push('/customer/dashboard');
        }
      }
    }
  }, [authStatus, loading, isOperator, activeRole, router, requireAdmin]);

  // Show loading while authenticating or waiting for role determination
  if (authStatus === 'configuring' || loading) {
    return <LoadingSpinner message={requireAdmin ? 'Verifying administrator access...' : 'Verifying operator access...'} />;
  }

  if (authStatus === 'authenticated') {
    // Only proceed to access check if we have role information
    if (activeRole === null) {
      // User has no operator/admin role, redirect to customer portal
      return <LoadingSpinner message="Redirecting to authorized portal..." />;
    }

    const canAccess = requireAdmin ? activeRole === 'administrator' : isOperator;
    if (canAccess) {
      return <>{children}</>;
    }
    return <LoadingSpinner message="Redirecting to authorized portal..." />;
  }

  return <LoadingSpinner message="Redirecting to login..." />;
}
