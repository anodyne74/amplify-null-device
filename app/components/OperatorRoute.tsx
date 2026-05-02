'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { isAdmin, isOperator } from '@/lib/amplify-config';
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
  const { authStatus, user } = useAuthenticator();

  useEffect(() => {
    if (authStatus === 'authenticated' && user) {
      const canAccess = requireAdmin ? isAdmin(user) : isOperator(user);

      if (canAccess) {
        return;
      }

      // If not an operator, redirect to customer portal
      router.push('/customer/dashboard');
      return;
    }

    // If not authenticated, redirect to login
    if (authStatus === 'unauthenticated') {
      router.push('/');
    }
  }, [authStatus, user, router, requireAdmin]);

  if (authStatus === 'configuring') {
    return <LoadingSpinner message="Configuring authentication..." />;
  }

  if (authStatus === 'authenticated' && user) {
    const canAccess = requireAdmin ? isAdmin(user) : isOperator(user);
    if (canAccess) {
      return <>{children}</>;
    }

    return <LoadingSpinner message={requireAdmin ? 'Redirecting to authorized portal...' : 'Redirecting to operator portal...'} />;
  }

  return <LoadingSpinner message={requireAdmin ? 'Verifying administrator access...' : 'Verifying operator access...'} />;
}
