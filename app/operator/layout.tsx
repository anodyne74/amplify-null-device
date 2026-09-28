'use client';

import OperatorRoute from '@/app/components/OperatorRoute';
import PortalShell, { type PortalNavItem } from '@/app/components/PortalShell';
import { usePortalUser } from '@/lib/usePortalUser';
import { useOperatorRouteNotifications } from '@/lib/useOperatorRouteNotifications';

const OPERATOR_NAV: PortalNavItem[] = [
  { href: '/operator/dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
  { href: '/operator/routes', label: 'Routes', icon: 'route' },
  { href: '/operator/calendar', label: 'Service Calendar', icon: 'calendar' },
  { href: '/operator/settings', label: 'Settings', icon: 'settings' },
];

/**
 * Operator Portal Layout
 * Provides navigation, logout and route-assignment notifications for
 * authenticated operators. Responsive: collapsible sidebar on mobile.
 */
export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  const { userId, displayName, logout } = usePortalUser();
  useOperatorRouteNotifications(userId ?? null);

  return (
    <OperatorRoute>
      <PortalShell variant="operator" navItems={OPERATOR_NAV} userName={displayName} onLogout={logout}>
        {children}
      </PortalShell>
    </OperatorRoute>
  );
}
