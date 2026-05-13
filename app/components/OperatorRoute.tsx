'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useUserGroups } from '@/lib/use-user-groups';
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
  const { loading, isAdmin, isOperator, isCustomer } = useUserGroups();

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/');
      return;
    }

    if (authStatus === 'authenticated' && !loading) {
      if (requireAdmin) {
        if (!isAdmin) {
          if (isOperator) {
            router.push('/operator/dashboard');
            return;
          }

          if (isCustomer) {
            router.push('/customer/dashboard');
            return;
          }

          router.push('/pending-approval');
        }
      } else {
        // Admin-only users should be sent to the admin portal, but dual-role users
        // are allowed to stay in operator mode when they explicitly choose it.
        if (isAdmin && !isOperator) {
          router.push('/administrator');
          return;
        }

        if (!isOperator) {
          if (isCustomer) {
            router.push('/customer/dashboard');
            return;
          }

          router.push('/pending-approval');
          return;
        }
      }
    }
  }, [authStatus, isAdmin, isCustomer, isOperator, loading, requireAdmin, router]);

  if (authStatus === 'configuring' || loading) {
    return <LoadingSpinner message={requireAdmin ? 'Verifying administrator access...' : 'Verifying operator access...'} />;
  }

  if (authStatus === 'authenticated') {
    const canAccess = requireAdmin ? isAdmin : isOperator;
    if (canAccess) {
      return <>{children}</>;
    }

    return <LoadingSpinner message="Redirecting to authorized portal..." />;
  }

  return <LoadingSpinner message="Redirecting to login..." />;
}
