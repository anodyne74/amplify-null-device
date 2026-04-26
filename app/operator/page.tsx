'use client';

import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { isOperator } from '@/lib/amplify-config';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { useEffect } from 'react';

/**
 * Operator Page Redirect
 * Automatically redirects to operator dashboard
 */
export default function OperatorPage() {
  const router = useRouter();
  const { authStatus, user } = useAuthenticator();

  useEffect(() => {
    if (authStatus === 'authenticated' && user && isOperator(user)) {
      router.push('/operator/dashboard');
    }
  }, [authStatus, user, router]);

  return <LoadingSpinner message="Redirecting to operator dashboard..." />;
}
