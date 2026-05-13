'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthenticator, Authenticator } from '@aws-amplify/ui-react';
import { useUserGroups } from '@/lib/use-user-groups';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import styles from './page.module.css';

/**
 * Home Page
 * Redirects authenticated users to their appropriate portal:
 * - Administrators → /administrator
 * - Operators → /operator/dashboard
 * - Customers → /customer/dashboard
 * Unauthenticated users see the login form (from Authenticator)
 */
export default function Home() {
  const router = useRouter();
  const { authStatus } = useAuthenticator();
  const { groups, loading } = useUserGroups();

  const handleRoleSelect = (_key: string, path: string) => {
    router.push(path);
  };

  const roleOptions = useMemo(() => {
    const options: Array<{ key: string; title: string; path: string }> = [];

    if (groups.includes('administrator')) {
      options.push({
        key: 'administrator',
        title: 'Administrator Portal',
        path: '/administrator',
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
            <p className={styles.subtitle}>Choose Administrator for desktop management or Operator for on-route mobile use.</p>
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

  // Unauthenticated - show login page with branding and custom themed Authenticator
  return (
    <div className={styles.loginPage}>
      <div className={styles.loginContainer}>
        {/* Branding Section */}
        <div className={styles.brandingSection}>
          <div className={styles.logo}>◆</div>
          <h1 className={styles.brandTitle}>NullDevice</h1>
          <p className={styles.brandSubtitle}>Route Planning & Delivery Management</p>
        </div>

        {/* Welcome Section */}
        <div className={styles.welcomeSection}>
          <h2 className={styles.welcomeTitle}>Welcome Back</h2>
          <p className={styles.welcomeText}>
            Sign in to your account to access routes, customers, and delivery operations.
          </p>
        </div>

        {/* Authenticator Card - Uses styling from page.module.css */}
        <div className={styles.authCard}>
          <Authenticator 
            hideSignUp={false}
            formFields={{
              signUp: {
                given_name: {
                  order: 1,
                  label: 'First Name',
                  placeholder: 'Enter your first name',
                  isRequired: true,
                },
                email: {
                  order: 2,
                },
                password: {
                  order: 3,
                },
                confirm_password: {
                  order: 4,
                },
              },
            }}
            components={{
              SignUp: {
                Header() {
                  return (
                    <div className={styles.signupHeader}>
                      <h2 className={styles.signupHeaderTitle}>Request Access</h2>
                      <p className={styles.signupHeaderText}>
                        New accounts require administrator approval before portal access is granted.
                      </p>
                    </div>
                  );
                },
              },
            }}
          />
        </div>

        {/* Footer Section */}
        <div className={styles.footerSection}>
          <p className={styles.footerText}>
            Need help? Contact support at <strong>support@nulldevice.local</strong>
          </p>
        </div>
      </div>
    </div>
  );
}
