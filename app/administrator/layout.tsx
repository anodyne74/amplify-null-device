'use client';

import { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import OperatorRoute from '@/app/components/OperatorRoute';
import AdminShell from '@/app/administrator/components/AdminShell';
import { useThemeMode } from '@/app/components/AmplifyThemeProvider';
import { getUserDisplayName } from '@/lib/amplify-config';
import { getUserSettings } from '@/lib/queries';

const ADMIN_NAV = [
  { href: '/administrator', label: 'Admin Home', icon: 'layout-dashboard' },
  { href: '/administrator/routes', label: 'Routes', icon: 'route' },
  { href: '/administrator/customers', label: 'Customers', icon: 'users' },
  { href: '/administrator/invoices', label: 'Invoices', icon: 'file-text' },
  { href: '/administrator/calendar', label: 'Service Calendar', icon: 'calendar' },
  { href: '/administrator/users', label: 'Users', icon: 'user' },
  { href: '/administrator/settings', label: 'Settings', icon: 'settings' },
];

/**
 * Administrator Portal Layout
 * Provides navigation and logout for authenticated administrators.
 * Responsive design: collapsible sidebar on mobile, fixed on desktop.
 */
export default function AdministratorLayout({ children }: { children: React.ReactNode }) {
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
    <OperatorRoute requireAdmin>
      <AdminShell navItems={ADMIN_NAV} userEmail={userDisplayName} onLogout={signOut}>
        {children}
      </AdminShell>
    </OperatorRoute>
  );
}

