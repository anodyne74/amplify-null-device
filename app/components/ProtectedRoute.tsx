'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useUserGroups } from '@/lib/use-user-groups';
import LoadingSpinner from './LoadingSpinner';

/**
 * ProtectedRoute Component
 * Restricts access to authenticated customers only
 * Redirects non-authenticated users to login or operators to operator portal
 */
export default function ProtectedRoute({
  children,
  requireCustomer = true,
}: {
  children: React.ReactNode;
  requireCustomer?: boolean;
}) {
  const router = useRouter();
  const { authStatus } = useAuthenticator();
  const { loading, isOperator } = useUserGroups();

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/');
      return;
    }

    if (authStatus === 'authenticated' && !loading) {
      // If this is a customer-only route and user is an operator, redirect to operator portal
      if (requireCustomer && isOperator) {
        router.push('/operator/dashboard');
      }
    }
  }, [authStatus, loading, isOperator, router, requireCustomer]);

  if (authStatus === 'configuring' || (authStatus === 'authenticated' && loading)) {
    return <LoadingSpinner message="Loading..." />;
  }

  if (authStatus === 'authenticated') {
    return <>{children}</>;
  }

  return <LoadingSpinner message="Redirecting to login..." />;
}
