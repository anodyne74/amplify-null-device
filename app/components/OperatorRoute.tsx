'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useUserGroups } from '@/lib/use-user-groups';
import LoadingSpinner from './LoadingSpinner';

/**
 * OperatorRoute Component
 * Restricts access to authenticated operators only
 * Redirects non-operators to customer portal
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
  const { loading, isAdmin, isOperator } = useUserGroups();

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/');
      return;
    }

    if (authStatus === 'authenticated' && !loading) {
      const canAccess = requireAdmin ? isAdmin : isOperator;
      if (!canAccess) {
        router.push('/customer/dashboard');
      }
    }
  }, [authStatus, loading, isAdmin, isOperator, router, requireAdmin]);

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
