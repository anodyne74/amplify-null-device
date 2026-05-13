'use client';

import { useEffect } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { faGauge, faRoad, faUsers, faFileInvoice, faUser, faGear } from '@fortawesome/free-solid-svg-icons';
import OperatorRoute from '@/app/components/OperatorRoute';
import PortalLayout from '@/app/components/PortalLayout';
import { getUserDisplayName } from '@/lib/amplify-config';
import { getUserSettings } from '@/lib/queries';

const ADMIN_NAV = [
  { href: '/administrator', label: 'Admin Home', icon: faGauge },
  { href: '/administrator/routes', label: 'Routes', icon: faRoad },
  { href: '/administrator/customers', label: 'Customers', icon: faUsers },
  { href: '/administrator/invoices', label: 'Invoices', icon: faFileInvoice },
  { href: '/administrator/users', label: 'Users', icon: faUser },
  { href: '/administrator/settings', label: 'Settings', icon: faGear },
];

/**
 * Administrator Portal Layout
 * Provides navigation and logout for authenticated administrators.
 * Responsive design: collapsible sidebar on mobile, fixed on desktop.
 */
export default function AdministratorLayout({ children }: { children: React.ReactNode }) {
  const { signOut, user } = useAuthenticator();
  const userDisplayName = user ? getUserDisplayName(user) ?? '' : '';

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
    if (!user?.userId) return;
    if (typeof getUserSettings !== 'function') return;
    let cancelled = false;

    void getUserSettings(user.userId)
      .then((result) => {
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
  }, [user?.userId]);

  return (
    <OperatorRoute requireAdmin>
      <PortalLayout
        variant="operator"
        portalTitle="Administrator Portal"
        navItems={ADMIN_NAV}
        userEmail={userDisplayName}
        onLogout={signOut}
      >
        {children}
      </PortalLayout>
    </OperatorRoute>
  );
}

