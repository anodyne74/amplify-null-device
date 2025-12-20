'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { isOperator } from '@/lib/amplify-config';
import LoadingSpinner from './LoadingSpinner';

/**
 * OperatorRoute Component
 * Restricts access to authenticated operators only
 * Redirects non-operators to customer portal
 */
export default function OperatorRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { authStatus, user } = useAuthenticator();

  useEffect(() => {
    if (authStatus === 'authenticated' && user) {
      // Check if user is an operator
      if (isOperator(user)) {
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
  }, [authStatus, user, router]);

  if (authStatus === 'configuring') {
    return <LoadingSpinner message="Configuring authentication..." />;
  }

  if (authStatus === 'authenticated' && user && isOperator(user)) {
    return <>{children}</>;
  }

  return <LoadingSpinner message="Verifying operator access..." />;
}
