'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuthenticator, Authenticator } from '@aws-amplify/ui-react';
import { signIn, confirmSignIn } from 'aws-amplify/auth';
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
  { icon: 'map-pin', label: 'Plan and track routes end to end' },
  { icon: 'truck', label: 'Coordinate operators in the field, live' },
  { icon: 'receipt', label: 'Completed routes become invoices' },
];

function getSignInErrorMessage(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? String((error as { name?: unknown }).name) : '';
  if (name === 'NotAuthorizedException' || name === 'UserNotFoundException') {
    return "That email or password doesn't match. Try again, or reset your password.";
  }
  if (name === 'UserNotConfirmedException') {
    return 'Confirm your email before signing in.';
  }
  if (name === 'UserAlreadyAuthenticatedException') {
    return '';
  }
  if (name === 'InvalidPasswordException') {
    return "That password doesn't meet the requirements. Try a longer password with a mix of letters, numbers and symbols.";
  }
  return 'Something went wrong. Please try again.';
}

/**
 * Home Page
 * Redirects authenticated users to their appropriate portal:
 * - Administrators → /administrator
 * - Operators → /operator/dashboard
 * - Customers → /customer/dashboard
 * Unauthenticated users see a custom sign-in form; "Forgot password?" hands
 * off to the stock Authenticator for that flow.
 */
export default function Home() {
  const router = useRouter();
  const { authStatus, toForgotPassword, toSignIn } = useAuthenticator((context) => [
    context.authStatus,
    context.toForgotPassword,
    context.toSignIn,
  ]);
  const { groups, loading } = useUserGroups();

  const [authView, setAuthView] = useState<'signIn' | 'forgotPassword' | 'newPassword'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
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
      const { isSignedIn, nextStep } = await signIn({ username: email.trim(), password });
      // Admin-created accounts sign in with a temporary password, which
      // Cognito never treats as complete — it comes back as this challenge
      // instead of throwing, so without this check the form just sits there
      // with no error and no redirect.
      if (!isSignedIn && nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        setPassword('');
        setAuthView('newPassword');
      }
    } catch (error) {
      setSignInError(getSignInErrorMessage(error));
    }
    setSubmitting(false);
  };

  const handleNewPassword = async (event: FormEvent) => {
    event.preventDefault();
    setSignInError(null);

    if (newPassword !== confirmNewPassword) {
      setSignInError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      await confirmSignIn({ challengeResponse: newPassword });
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (error) {
      setSignInError(getSignInErrorMessage(error));
    }
    setSubmitting(false);
  };

  if (authStatus === 'configuring') {
    // The Authenticator machine hasn't finished its own async setup yet — its
    // toForgotPassword transition is a silent no-op until it has, so don't
    // show the (clickable) sign-in form before then.
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

  // Unauthenticated - show custom sign-in form, falling back to the stock
  // Authenticator for "Forgot password?".
  return (
    <div className={styles.authPage}>
      <div className={styles.authGrid}>
        <div className={styles.formColumn} data-theme="light">
          <div className={styles.formInner}>
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
                    <a
                      href="#"
                      className={styles.linkButton}
                      onClick={(event) => {
                        event.preventDefault();
                        setAuthView('forgotPassword');
                        toForgotPassword();
                      }}
                    >
                      Forgot password?
                    </a>
                  </div>
                  <Button type="submit" size="lg" block loading={submitting} disabled={submitting}>
                    Sign in
                  </Button>
                </form>
              </>
            ) : authView === 'newPassword' ? (
              <>
                <h1 className={styles.welcomeTitle}>Set a new password</h1>
                <p className={styles.welcomeText}>
                  You&apos;re signing in with a temporary password. Choose a new password to finish setting up your
                  account.
                </p>

                <form className={styles.signInForm} onSubmit={handleNewPassword}>
                  <Field label="New password" htmlFor="new-password">
                    <Input
                      id="new-password"
                      type="password"
                      autoComplete="new-password"
                      required
                      invalid={!!signInError}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      disabled={submitting}
                    />
                  </Field>
                  <Field label="Confirm new password" htmlFor="confirm-new-password" error={signInError || undefined}>
                    <Input
                      id="confirm-new-password"
                      type="password"
                      autoComplete="new-password"
                      required
                      invalid={!!signInError}
                      value={confirmNewPassword}
                      onChange={(event) => setConfirmNewPassword(event.target.value)}
                      disabled={submitting}
                    />
                  </Field>
                  <Button type="submit" size="lg" block loading={submitting} disabled={submitting}>
                    Set password and sign in
                  </Button>
                </form>
              </>
            ) : (
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
            )}

            {/* Mounted unconditionally (rather than only when authView ===
                'forgotPassword') and hidden via the `hidden` attribute
                instead. The shared Authenticator machine starts in a
                'setup' route and only leaves it -- to its default 'signIn'
                screen -- the first time an <Authenticator> widget anywhere
                in the app mounts and fires its one-time INIT event. If that
                first mount happens on click (i.e. only rendering this when
                authView flips to 'forgotPassword'), INIT fires in the same
                render pass as toForgotPassword() and silently wins the
                race, resetting the machine back to 'signIn' -- so the very
                first click shows the Authenticator's own sign-in view
                instead of the reset-password form. Mounting it here at
                initial page load lets INIT resolve harmlessly before the
                user ever clicks "Forgot password?". */}
            <div className={styles.authCard} hidden={authView !== 'forgotPassword'}>
              <Authenticator hideSignUp />
            </div>

            <p className={styles.footerText}>
              Need help? Contact support at <strong><a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></strong>
            </p>
          </div>
        </div>

        <div className={styles.heroColumn} aria-hidden="true">
          <div className={styles.heroOrb} />
          <Image
            src="/icon.svg"
            alt=""
            width={560}
            height={560}
            className={styles.heroWatermark}
          />
          <div className={styles.heroBrandMobile}>
            <Image src="/icon.svg" alt="" width={32} height={32} />
            <span>null device</span>
          </div>
          <div className={styles.heroContent}>
            <div className={styles.heroHeadline}>Keep every route, sign, and invoice moving.</div>
            <div className={styles.heroList}>
              {HERO_FEATURES.map((feature) => (
                <div key={feature.label} className={styles.heroListItem}>
                  <Icon name={feature.icon} size={16} />
                  {feature.label}
                </div>
              ))}
            </div>
            <div className={styles.heroFooter}>One door · customers · operators · null device staff</div>
          </div>
        </div>
      </div>
    </div>
  );
}
