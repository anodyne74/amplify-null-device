'use client';

import { useAuthenticator } from '@aws-amplify/ui-react';
import OperatorRoute from '@/app/components/OperatorRoute';
import PortalLayout from '@/app/components/PortalLayout';
import { getUserDisplayName } from '@/lib/amplify-config';
import { useUserGroups } from '@/lib/use-user-groups';

const OPERATOR_NAV = [
  { href: '/operator/dashboard', label: 'Dashboard', icon: '◈' },
  { href: '/operator/routes', label: 'Routes', icon: '⟶' },
];

const ADMIN_NAV = [
  { href: '/operator/admin', label: 'Admin Home', icon: '◆' },
  { href: '/operator/customers', label: 'Customers', icon: '⊞' },
  { href: '/operator/invoices', label: 'Invoices', icon: '◻' },
  { href: '/operator/users', label: 'Users', icon: '◉' },
];

/**
 * Operator Portal Layout
 * Provides navigation, admin menu, and logout for authenticated operators.
 * Responsive design: collapsible sidebar on mobile, fixed on desktop.
 */
export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  const { signOut, user } = useAuthenticator();
  const { isAdmin } = useUserGroups();
  const userDisplayName = user ? getUserDisplayName(user) ?? '' : '';
  const navItems = isAdmin ? [...OPERATOR_NAV, ...ADMIN_NAV] : OPERATOR_NAV;

  return (
    <OperatorRoute>
      <PortalLayout
        variant="operator"
        portalTitle="Operator Portal"
        navItems={navItems}
        userEmail={userDisplayName}
        onLogout={signOut}
      >
        {children}
      </PortalLayout>
    </OperatorRoute>
  );
}

