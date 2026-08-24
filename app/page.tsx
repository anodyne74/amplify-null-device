'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuthenticator, Authenticator } from '@aws-amplify/ui-react';
import { signIn } from 'aws-amplify/auth';
import { useUserGroups } from '@/lib/use-user-groups';
import { buildPortalOptions } from '@/lib/portalRouting';
import { getLandingRedirect } from '@/lib/auth-routing';
import { SUPPORT_EMAIL } from '@/lib/publicAppConfig';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { Icon } from '@/app/components/ui/core/Icon';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Checkbox } from '@/app/components/ui/forms/Checkbox';
import { Button } from '@/app/components/ui/core/Button';
import styles from './page.module.css';

const HERO_FEATURES = [
  'Plan and track delivery routes end to end',
  'Coordinate operators in the field, in real time',
  'Turn completed routes into invoices automatically',
];

const SIGNUP_FORM_FIELDS = {
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
};

const SIGNUP_COMPONENTS = {
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
};

function getSignInErrorMessage(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? String((error as { name?: unknown }).name) : '';
  if (name === 'NotAuthorizedException' || name === 'UserNotFoundException') {
    return 'Incorrect email or password.';
  }
  if (name === 'UserNotConfirmedException') {
    return 'Confirm your email before signing in.';
  }
  if (name === 'UserAlreadyAuthenticatedException') {
    return '';
  }
  return 'Something went wrong. Please try again.';
}

/**
 * Home Page
 * Redirects authenticated users to their appropriate portal:
 * - Administrators → /administrator
 * - Operators → /operator/dashboard
 * - Customers → /customer/dashboard
 * Unauthenticated users see a custom sign-in form; "Forgot password?" and
 * "Request an account" hand off to the stock Authenticator for those flows.
 */
export default function Home() {
  const router = useRouter();
  const { authStatus, toForgotPassword, toSignIn, toSignUp } = useAuthenticator((context) => [
    context.authStatus,
    context.toForgotPassword,
    context.toSignIn,
    context.toSignUp,
  ]);
  const { groups, loading } = useUserGroups();

  const [authView, setAuthView] = useState<'signIn' | 'forgotPassword' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

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

  const handleSignIn = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setSignInError(null);

    try {
      await signIn({ username: email.trim(), password });
    } catch (error) {
      setSignInError(getSignInErrorMessage(error));
    }
    setSubmitting(false);
  };

  if (authStatus === 'configuring') {
    // The Authenticator machine hasn't finished its own async setup yet — its
    // toForgotPassword/toSignUp transitions are silent no-ops until it has,
    // so don't show the (clickable) sign-in form before then.
    return <LoadingSpinner message="Loading..." />;
  }

  if (authStatus === 'authenticated') {
    if (!loading && roleOptions.length > 1) {
      return (
        <div className={styles.wrapper}>
          <div className={styles.card}>
            <h1 className={styles.heading}>Choose Portal Role</h1>
            <p className={styles.subtitle}>Your account has access to more than one portal. Pick where to go.</p>
            <div className={styles.roleButtons}>
              {roleOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={styles.roleButton}
                  onClick={() => handleRoleSelect(option.key, option.path)}
                >
                  <span className={styles.roleButtonTitle}>{option.title}</span>
                  <span className={styles.roleButtonDescription}>{option.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }
    return <LoadingSpinner message="Redirecting to dashboard..." />;
  }

  // Unauthenticated - show custom sign-in form with branding, falling back to
  // the stock Authenticator for "Forgot password?" and "Request an account".
  return (
    <div className={styles.authPage}>
      <div className={styles.authGrid}>
        <div className={styles.formColumn}>
          <div className={styles.formInner}>
            <div className={styles.brand} aria-label="null device">
              <Image
                src="/icon.svg"
                alt=""
                aria-hidden="true"
                className={styles.brandLogo}
                width={44}
                height={44}
                priority
              />
              <span className={styles.brandWordmark}>null device</span>
            </div>

            {authView === 'signIn' ? (
              <>
                <h1 className={styles.welcomeTitle}>Welcome back</h1>
                <p className={styles.welcomeText}>
                  Sign in to your portal — routes, jobs and invoices, wherever you left them.
                </p>

                <form className={styles.signInForm} onSubmit={handleSignIn}>
                  <Field label="Work email" htmlFor="signin-email">
                    <Input
                      id="signin-email"
                      type="email"
                      iconLeft="mail"
                      autoComplete="username"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      disabled={submitting}
                    />
                  </Field>
                  <Field label="Password" htmlFor="signin-password" error={signInError || undefined}>
                    <Input
                      id="signin-password"
                      type="password"
                      autoComplete="current-password"
                      required
                      invalid={!!signInError}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      disabled={submitting}
                    />
                  </Field>
                  <div className={styles.signInRow}>
                    <Checkbox label="Keep me signed in" defaultChecked disabled={submitting} />
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => {
                        setAuthView('forgotPassword');
                        toForgotPassword();
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Button type="submit" size="lg" block loading={submitting} disabled={submitting}>
                    Sign in
                  </Button>
                </form>

                <div className={styles.divider}>
                  <span>no account yet</span>
                </div>

                <Button
                  type="button"
                  size="lg"
                  block
                  variant="secondary"
                  iconLeft="user-plus"
                  onClick={() => {
                    setAuthView('signUp');
                    toSignUp();
                  }}
                >
                  Request an account
                </Button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={styles.backLink}
                  onClick={() => {
                    setAuthView('signIn');
                    toSignIn();
                  }}
                >
                  <Icon name="chevron-left" size={16} />
                  Back to sign in
                </button>
                <div className={styles.authCard}>
                  <Authenticator
                    hideSignUp={authView !== 'signUp'}
                    formFields={SIGNUP_FORM_FIELDS}
                    components={SIGNUP_COMPONENTS}
                  />
                </div>
              </>
            )}

            <p className={styles.footerText}>
              Need help? Contact support at <strong><a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></strong>
            </p>
          </div>
        </div>

        <div className={styles.heroColumn} aria-hidden="true">
          <div className={styles.heroOrb} />
          <div className={styles.heroBrandMobile}>
            <Image src="/icon.svg" alt="" width={32} height={32} />
            <span>null device</span>
          </div>
          <div className={styles.heroContent}>
            <div className={styles.heroHeadline}>Keep every route, sign, and invoice moving.</div>
            <div className={styles.heroList}>
              {HERO_FEATURES.map((feature) => (
                <div key={feature} className={styles.heroListItem}>
                  <Icon name="check" size={16} />
                  {feature}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
