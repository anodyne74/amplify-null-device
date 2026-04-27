'use client';

import { useAuthenticator } from '@aws-amplify/ui-react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import PortalLayout from '@/app/components/PortalLayout';
import { getUserEmail } from '@/lib/amplify-config';
import { useSessionTimeout, useLogout } from '@/app/auth/sessionManager';

const CUSTOMER_NAV = [
  { href: '/customer/dashboard', label: 'Dashboard', icon: '◈' },
  { href: '/customer/routes', label: 'Routes', icon: '⟶' },
  { href: '/customer/invoices', label: 'Invoices', icon: '◻' },
];

/**
 * Customer Portal Layout
 * Provides navigation, branding, and logout for authenticated customers.
 * Includes session timeout after 30 minutes of inactivity.
 */
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthenticator();
  const userEmail = user ? getUserEmail(user) : '';
  const { logout } = useLogout();

  useSessionTimeout();

  return (
    <ProtectedRoute requireCustomer={true}>
      <PortalLayout
        variant="customer"
        portalTitle="Customer Portal"
        navItems={CUSTOMER_NAV}
        userEmail={userEmail}
        onLogout={logout}
        confirmLogout={true}
      >
        {children}
      </PortalLayout>
    </ProtectedRoute>
  );
}

