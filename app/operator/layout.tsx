'use client';

import { useAuthenticator } from '@aws-amplify/ui-react';
import OperatorRoute from '@/app/components/OperatorRoute';
import PortalLayout from '@/app/components/PortalLayout';
import { getUserEmail } from '@/lib/amplify-config';

const OPERATOR_NAV = [
  { href: '/operator/dashboard', label: 'Dashboard', icon: '◈' },
  { href: '/operator/customers', label: 'Customers', icon: '⊞' },
  { href: '/operator/routes', label: 'Routes', icon: '⟶' },
  { href: '/operator/invoices', label: 'Invoices', icon: '◻' },
];

/**
 * Operator Portal Layout
 * Provides navigation, admin menu, and logout for authenticated operators.
 * Responsive design: collapsible sidebar on mobile, fixed on desktop.
 */
export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  const { signOut, user } = useAuthenticator();
  const userEmail = user ? getUserEmail(user) ?? '' : '';

  return (
    <OperatorRoute>
      <PortalLayout
        variant="operator"
        portalTitle="Operator Portal"
        navItems={OPERATOR_NAV}
        userEmail={userEmail}
        onLogout={signOut}
      >
        {children}
      </PortalLayout>
    </OperatorRoute>
  );
}

