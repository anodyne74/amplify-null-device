'use client';

import { useEffect, useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuthenticator, Authenticator } from '@aws-amplify/ui-react';
import { useUserGroups } from '@/lib/use-user-groups';
import { buildPortalOptions } from '@/lib/portalRouting';
import { getLandingRedirect } from '@/lib/auth-routing';
import { SUPPORT_EMAIL } from '@/lib/publicAppConfig';
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
    return buildPortalOptions(groups);
  }, [groups]);

  useEffect(() => {
    if (authStatus === 'authenticated' && !loading) {
      const destination = getLandingRedirect(groups);
      if (destination) {
        router.push(destination);
      }
    }
  }, [authStatus, loading, groups, router]);

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
          <div className={styles.logoLockup} aria-label="null device">
            <Image
              src="/icon.svg"
              alt=""
              aria-hidden="true"
              className={styles.logoMark}
              width={96}
              height={96}
              priority
            />
            <span className={styles.logoWordmark}>null device</span>
          </div>
        </div>

        {/* Welcome Section */}
        <div className={styles.welcomeSection}>
          <h2 className={styles.welcomeTitle}>Welcome Back</h2>
          <p className={styles.welcomeText}>
            Sign in to your account to access routes and delivery operations.
          </p>
        </div>

        {/* Authenticator Card - Uses styling from page.module.css */}
        <div className={styles.authCard}>
          <Authenticator 
            hideSignUp={false}
            formFields={{
              signIn: {
                username: { 
                  label: 'Email', 
                  placeholder: 'Enter your email address',
                  isRequired: true,
                  type: 'email',
                },
              },
              signUp: {
                username: { 
                  order: 1, 
                  label: 'Email', 
                  placeholder: 'Enter your email address',
                  isRequired: true,
                  type: 'email',
                },
                password: {
                  order: 2,
                },
                confirm_password: {
                  order: 3,
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
            Need help? Contact support at <strong><a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></strong>
          </p>
        </div>
      </div>
    </div>
  );
}
