'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useUserGroups } from '@/lib/use-user-groups';
import LoadingSpinner from '@/app/components/LoadingSpinner';

/**
 * Operator Page Redirect
 * Redirects authenticated users to the correct operator portal landing page.
 */
export default function OperatorPage() {
  const router = useRouter();
  const { authStatus } = useAuthenticator();
  const { groups, loading } = useUserGroups();

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/');
      return;
    }

    if (authStatus !== 'authenticated' || loading) {
      return;
    }

    if (groups.includes('operator')) {
      router.push('/operator/dashboard');
      return;
    }

    if (groups.includes('administrator')) {
      router.push('/administrator');
      return;
    }

    if (groups.includes('customer')) {
      router.push('/customer/dashboard');
      return;
    }

    router.push('/pending-approval');
  }, [authStatus, groups, loading, router]);

  return <LoadingSpinner message="Resolving portal access..." />;
}
