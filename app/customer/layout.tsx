'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { faHome, faRoad, faFileInvoice } from '@fortawesome/free-solid-svg-icons';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import PortalLayout from '@/app/components/PortalLayout';
import { getUserDisplayName } from '@/lib/amplify-config';
import { getCustomerPortalContext } from '@/lib/queries';
import { useSessionTimeout, useLogout } from '@/app/auth/sessionManager';

const CUSTOMER_NAV = [
  { href: '/customer/dashboard', label: 'Dashboard', icon: faHome },
  { href: '/customer/routes', label: 'Routes', icon: faRoad },
  { href: '/customer/invoices', label: 'Invoices', icon: faFileInvoice },
];

/**
 * Customer Portal Layout
 * Provides navigation, branding, and logout for authenticated customers.
 * Includes session timeout after 30 minutes of inactivity.
 */
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthenticator();
  const userDisplayName = user ? getUserDisplayName(user) ?? '' : '';
  const [customerRole, setCustomerRole] = useState<'account_owner' | 'read_only'>('account_owner');
  const { logout } = useLogout();

  useSessionTimeout();

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

