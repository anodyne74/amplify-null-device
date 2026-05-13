'use client';

import { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import OperatorRoute from '@/app/components/OperatorRoute';
import OperatorMUILayout from '@/app/operator/mui-layout';
import { getUserDisplayName } from '@/lib/amplify-config';
import { getUserSettings } from '@/lib/queries';

/**
 * Operator Portal Layout
 * Uses Material UI components with NullDevice dark theme
 * Optimized for mobile-first field use
 */
export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  const { signOut, user } = useAuthenticator();
  const fallbackDisplayName = user ? getUserDisplayName(user) ?? '' : '';
  const [userDisplayName, setUserDisplayName] = useState(fallbackDisplayName);

  const applyThemeMode = (theme: 'system' | 'light' | 'dark') => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('nd-theme-mode', theme);
    const resolved =
      theme === 'system'
        ? window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : theme;
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.style.colorScheme = resolved;
  };

  useEffect(() => {
    setUserDisplayName(fallbackDisplayName);
  }, [fallbackDisplayName]);

  useEffect(() => {
    if (!user?.userId) return;
    if (typeof getUserSettings !== 'function') return;
    let cancelled = false;

    void getUserSettings(user.userId)
      .then((result) => {
        const configuredName = result.data?.name?.trim();
        if (!cancelled) {
          setUserDisplayName(configuredName || fallbackDisplayName);
        }

        const defaultTheme = result.data?.defaultTheme;
        if (cancelled || !defaultTheme) return;
        applyThemeMode(defaultTheme);
      })
      .catch(() => {
        // Non-blocking: keep current theme if settings cannot be loaded.
      });

    return () => {
      cancelled = true;
    };
  }, [fallbackDisplayName, user?.userId]);

  return (
    <OperatorRoute>
      <OperatorMUILayout userEmail={userDisplayName} onLogout={signOut}>
        {children}
      </OperatorMUILayout>
    </OperatorRoute>
  );
}

