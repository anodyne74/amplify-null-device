'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { faHome, faRoad, faFileInvoice, faGear } from '@fortawesome/free-solid-svg-icons';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import PortalLayout from '@/app/components/PortalLayout';
import { getUserDisplayName } from '@/lib/amplify-config';
import { getCustomerPortalContext, getUserSettings } from '@/lib/queries';
import { useSessionTimeout, useLogout } from '@/app/auth/sessionManager';

const CUSTOMER_NAV = [
  { href: '/customer/dashboard', label: 'Dashboard', icon: faHome },
  { href: '/customer/routes', label: 'Routes', icon: faRoad },
  { href: '/customer/invoices', label: 'Invoices', icon: faFileInvoice },
  { href: '/customer/settings', label: 'Settings', icon: faGear },
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
  }, [fallbackDisplayName, user?.userId]);

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
      <PortalLayout
        variant="customer"
        portalTitle="Customer Portal"
        navItems={navItems}
        userEmail={userDisplayName}
        onLogout={logout}
        confirmLogout={true}
      >
        {children}
      </PortalLayout>
    </ProtectedRoute>
  );
}

