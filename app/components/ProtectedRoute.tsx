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
  const { loading, isAdmin, isOperator, isCustomer } = useUserGroups();

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/');
      return;
    }

    if (authStatus === 'authenticated' && !loading) {
      if (requireCustomer && isOperator && !isCustomer) {
        router.push('/operator/dashboard');
        return;
      }

      if (requireCustomer && isAdmin && !isCustomer) {
        router.push('/administrator');
        return;
      }

      if (requireCustomer && !isCustomer) {
        router.push('/pending-approval');
      }
    }
  }, [authStatus, isAdmin, isCustomer, isOperator, loading, requireCustomer, router]);

  if (authStatus === 'configuring' || (authStatus === 'authenticated' && loading)) {
    return <LoadingSpinner message="Loading..." />;
  }

  if (authStatus === 'authenticated' && (!requireCustomer || isCustomer)) {
    return <>{children}</>;
  }

  return <LoadingSpinner message="Redirecting..." />;
}
