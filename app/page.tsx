'use client';

import { useEffect, useMemo } from 'react';
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
  const { groups, loading } = useUserGroups();

  const handleRoleSelect = (key: string, path: string) => {
    // Store role selection for operator/administrator choices
    if (key === 'operator' || key === 'administrator') {
      localStorage.setItem('selectedOperatorRole', key);
    }
    router.push(path);
  };

  const roleOptions = useMemo(() => {
    const options: Array<{ key: string; title: string; path: string }> = [];

    if (groups.includes('administrator')) {
      options.push({
        key: 'administrator',
        title: 'Administrator Portal',
        path: '/operator/admin',
      });
    }

    if (groups.includes('operator')) {
      options.push({
        key: 'operator',
        title: 'Operator Portal',
        path: '/operator/dashboard',
      });
    }

    if (groups.includes('customer')) {
      options.push({
        key: 'customer',
        title: 'Customer Portal',
        path: '/customer/dashboard',
      });
    }

    return options;
  }, [groups]);

  useEffect(() => {
    if (authStatus === 'authenticated' && !loading) {
      if (roleOptions.length === 1) {
        router.push(roleOptions[0].path);
      } else if (roleOptions.length === 0) {
        router.push('/pending-approval');
      }
    }
  }, [authStatus, loading, roleOptions, router]);

  if (authStatus === 'authenticated') {
    if (!loading && roleOptions.length > 1) {
      return (
        <div className={styles.wrapper}>
          <div className={styles.card}>
            <h1 className={styles.heading}>Choose Portal Role</h1>
            <p className={styles.subtitle}>You have access to multiple roles. Select where you want to continue.</p>
            <div className={styles.roleButtons}>
              {roleOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={styles.roleButton}
                  onClick={() => handleRoleSelect(option.key, option.path)}
                >
                  {option.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }
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
