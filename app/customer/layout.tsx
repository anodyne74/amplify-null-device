'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import CustomerShell from '@/app/customer/components/CustomerShell';
import { useThemeMode } from '@/app/components/AmplifyThemeProvider';
import { getUserDisplayName } from '@/lib/amplify-config';
import { getCustomerPortalContext, getUserSettings } from '@/lib/queries';
import { useSessionTimeout, useLogout } from '@/app/auth/sessionManager';

const CUSTOMER_NAV = [
  { href: '/customer/dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
  { href: '/customer/routes', label: 'Routes', icon: 'route' },
  { href: '/customer/invoices', label: 'Invoices', icon: 'file-text' },
  { href: '/customer/settings', label: 'Settings', icon: 'settings' },
];

/**
 * Customer Portal Layout
 * Provides navigation, branding, and logout for authenticated customers.
 * Includes session timeout after 30 minutes of inactivity.
 */
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthenticator();
  const fallbackDisplayName = user ? getUserDisplayName(user) ?? '' : '';
  const [userDisplayName, setUserDisplayName] = useState(fallbackDisplayName);
  const [customerRole, setCustomerRole] = useState<'account_owner' | 'read_only'>('account_owner');
  const { logout } = useLogout();
  const { setMode: applyThemeMode } = useThemeMode();

  useSessionTimeout();

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

  useEffect(() => {
    if (!user?.userId) return;
    let cancelled = false;

    void getCustomerPortalContext(user.userId)
      .then((ctx) => {
        if (!cancelled) setCustomerRole(ctx.role);
      })
      .catch(() => {
        if (!cancelled) setCustomerRole('account_owner');
      });

    return () => {
      cancelled = true;
    };
  }, [user?.userId]);

  const navItems = useMemo(
    () => (customerRole === 'read_only' ? CUSTOMER_NAV.filter((item) => item.href !== '/customer/invoices') : CUSTOMER_NAV),
    [customerRole]
  );

  return (
    <ProtectedRoute requireCustomer={true}>
      <CustomerShell navItems={navItems} userEmail={userDisplayName} onLogout={logout}>
        {children}
      </CustomerShell>
    </ProtectedRoute>
  );
}

