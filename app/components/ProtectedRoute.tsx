'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { isCustomer, isOperator } from '@/lib/amplify-config';
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
  const { authStatus, user } = useAuthenticator();

  useEffect(() => {
    if (authStatus === 'authenticated' && user) {
      // If this is a customer-only route and user is an operator, redirect to operator portal
      if (requireCustomer && isOperator(user)) {
        router.push('/operator/dashboard');
        return;
      }

      // Customer access is allowed
      if (requireCustomer && isCustomer(user)) {
        return;
      }

      // If no specific requirement, just check authentication
      if (!requireCustomer) {
        return;
      }
    }

    // If not authenticated, redirect to login
    if (authStatus === 'unauthenticated') {
      router.push('/');
    }
  }, [authStatus, user, router, requireCustomer]);

  if (authStatus === 'configuring') {
    return <LoadingSpinner message="Configuring authentication..." />;
  }

  if (authStatus === 'authenticated') {
    return <>{children}</>;
  }

  return <LoadingSpinner message="Redirecting to login..." />;
}
