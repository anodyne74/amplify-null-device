'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { PORTAL_PATHS } from '@/lib/portalRouting';
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
      router.push(PORTAL_PATHS.customer);
    }
  }, [authStatus, router]);

  return <LoadingSpinner message="Redirecting to dashboard..." />;
}
