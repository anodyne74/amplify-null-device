'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { isOperator } from '@/lib/amplify-config';
import LoadingSpinner from '@/app/components/LoadingSpinner';

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

  // Unauthenticated users will see the Authenticator component from the layout
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: '#f5f5f5',
      }}
    >
      <div style={{ width: '100%', maxWidth: '400px', padding: '20px' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '24px' }}>
          Delivery Management System
        </h1>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: '24px' }}>
          Sign in to access your account
        </p>
        {/* Authenticator component is provided by the layout */}
      </div>
    </div>
  );
}
