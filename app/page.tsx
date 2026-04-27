'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { isOperator } from '@/lib/amplify-config';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import styles from './page.module.css';

/**
 * Home Page
 * Redirects authenticated users to their appropriate portal:
 * - Operators → /operator/dashboard
 * - Customers → /customer/dashboard
 * Unauthenticated users see the login form (from Authenticator)
 */
export default function Home() {
  const router = useRouter();
  const { authStatus, user } = useAuthenticator();

  useEffect(() => {
    if (authStatus === 'authenticated' && user) {
      if (isOperator(user)) {
        router.push('/operator/dashboard');
      } else {
        router.push('/customer/dashboard');
      }
    }
  }, [authStatus, user, router]);

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
