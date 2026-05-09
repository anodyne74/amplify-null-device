'use client';

import { useAuthenticator } from '@aws-amplify/ui-react';
import OperatorRoute from '@/app/components/OperatorRoute';
import PortalLayout from '@/app/components/PortalLayout';
import { getUserDisplayName } from '@/lib/amplify-config';

const ADMIN_NAV = [
  { href: '/administrator', label: 'Admin Home', icon: '◆' },
  { href: '/administrator/routes', label: 'Routes', icon: '⟶' },
  { href: '/administrator/customers', label: 'Customers', icon: '⊞' },
  { href: '/administrator/invoices', label: 'Invoices', icon: '◻' },
  { href: '/administrator/users', label: 'Users', icon: '◉' },
];

/**
 * Administrator Portal Layout
 * Provides navigation and logout for authenticated administrators.
 * Responsive design: collapsible sidebar on mobile, fixed on desktop.
 */
export default function AdministratorLayout({ children }: { children: React.ReactNode }) {
  const { signOut, user } = useAuthenticator();
  const userDisplayName = user ? getUserDisplayName(user) ?? '' : '';

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

