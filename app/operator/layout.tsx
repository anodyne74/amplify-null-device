'use client';

import { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import OperatorRoute from '@/app/components/OperatorRoute';
import OperatorShell from '@/app/operator/components/OperatorShell';
import { useThemeMode } from '@/app/components/AmplifyThemeProvider';
import { getUserDisplayName } from '@/lib/amplify-config';
import { getUserSettings } from '@/lib/queries';

const OPERATOR_NAV = [
  { href: '/operator/dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
  { href: '/operator/routes', label: 'Routes', icon: 'route' },
  { href: '/operator/settings', label: 'Settings', icon: 'settings' },
];

/**
 * Operator Portal Layout
 * Uses the shared PortalLayout (sidebar + main content shell) with the
 * operator accent variant. Responsive: collapsible sidebar on mobile.
 */
export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  const { signOut, user } = useAuthenticator();
  const fallbackDisplayName = user ? getUserDisplayName(user) ?? '' : '';
  const [userDisplayName, setUserDisplayName] = useState(fallbackDisplayName);
  const { setMode: applyThemeMode } = useThemeMode();

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
  }, [applyThemeMode, fallbackDisplayName, user?.userId]);

  return (
    <OperatorRoute>
      <OperatorShell navItems={OPERATOR_NAV} userEmail={userDisplayName} onLogout={signOut}>
        {children}
      </OperatorShell>
    </OperatorRoute>
  );
}
