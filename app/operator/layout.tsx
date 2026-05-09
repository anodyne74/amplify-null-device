'use client';

import { useAuthenticator } from '@aws-amplify/ui-react';
import OperatorRoute from '@/app/components/OperatorRoute';
import PortalLayout from '@/app/components/PortalLayout';
import { getUserDisplayName } from '@/lib/amplify-config';

const NAV_ITEMS = [
  { href: '/operator/dashboard', label: 'Dashboard', icon: '◈' },
  { href: '/operator/routes', label: 'Routes', icon: '⟶' },
];

/**
 * Operator Portal Layout
 * Provides navigation and logout for authenticated operators.
 * Responsive design: collapsible sidebar on mobile, fixed on desktop.
 */
export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  const { signOut, user } = useAuthenticator();
  const userDisplayName = user ? getUserDisplayName(user) ?? '' : '';

  return (
    <OperatorRoute>
      <PortalLayout
        variant="operator"
        portalTitle="Operator Portal"
        navItems={NAV_ITEMS}
        userEmail={userDisplayName}
        onLogout={signOut}
      >
        {children}
      </PortalLayout>
    </OperatorRoute>
  );
}

