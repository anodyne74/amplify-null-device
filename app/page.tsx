'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useUserGroups } from '@/lib/use-user-groups';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import styles from './page.module.css';

/**
 * Home Page
 * Redirects authenticated users to their appropriate portal:
 * - Administrators → /operator/admin
 * - Operators → /operator/dashboard
 * - Customers → /customer/dashboard
 * Unauthenticated users see the login form (from Authenticator)
 */
export default function Home() {
  const router = useRouter();
  const { authStatus } = useAuthenticator();
  const { loading, isAdmin, isOperator } = useUserGroups();

  useEffect(() => {
    if (authStatus === 'authenticated' && !loading) {
      if (isAdmin) {
        router.push('/operator/admin');
      } else if (isOperator) {
        router.push('/operator/dashboard');
      } else {
        router.push('/customer/dashboard');
      }
    }
  }, [authStatus, loading, isAdmin, isOperator, router]);

  if (authStatus === 'authenticated') {
    return <LoadingSpinner message="Redirecting to dashboard..." />;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1 className={styles.heading}>NullDevice</h1>
        <p className={styles.subtitle}>Delivery Management System</p>
      </div>
    </div>
  );
}
