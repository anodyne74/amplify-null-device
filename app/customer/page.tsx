'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import LoadingSpinner from '@/app/components/LoadingSpinner';

/**
 * Customer Page Redirect
 * Automatically redirects to customer dashboard
 */
export default function CustomerPage() {
  const router = useRouter();
  const { authStatus } = useAuthenticator();

  useEffect(() => {
    if (authStatus === 'authenticated') {
      router.push('/customer/dashboard');
    }
  }, [authStatus, router]);

  return <LoadingSpinner message="Redirecting to dashboard..." />;
}
