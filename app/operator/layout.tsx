'use client';

import OperatorRoute from '@/app/components/OperatorRoute';
import PortalShell, { type PortalNavItem } from '@/app/components/PortalShell';
import { usePortalUser } from '@/lib/usePortalUser';
import { useOperatorRouteNotifications } from '@/lib/useOperatorRouteNotifications';
import { useSessionRefresh } from '@/lib/useSessionRefresh';
import { signRunOutbox, useSignRunOutbox, useSignRunOutboxSender } from '@/lib/signRunOutbox';
import { UnsavedWritesIndicator, unsavedLogoutWarning } from '@/app/operator/components/UnsavedWritesIndicator';

/** Rendered inside OperatorRoute, so it only runs for a signed-in operator. */
function SessionRefresh({ userId }: { userId: string | null }) {
  useSessionRefresh();
  useSignRunOutboxSender(userId);
  return null;
}

const OPERATOR_NAV: PortalNavItem[] = [
  { href: '/operator/dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
  { href: '/operator/routes', label: 'Routes', icon: 'route' },
  { href: '/operator/calendar', label: 'Service Calendar', icon: 'calendar' },
  { href: '/operator/settings', label: 'Settings', icon: 'settings' },
];

/**
 * Operator Portal Layout
 * Provides navigation, logout, route-assignment notifications, early session
 * refresh and the Sign Run outbox's sender and save status for authenticated
 * operators. Responsive: collapsible sidebar on mobile.
 */
export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  const { userId, displayName, logout } = usePortalUser();
  useOperatorRouteNotifications(userId ?? null);
  const { entries } = useSignRunOutbox();

  // Logging out with Sign Run actions still unsaved drops them, recorded as discarded.
  const logoutDiscardingUnsaved = async () => {
    await signRunOutbox.discardAll();
    await logout();
  };

  return (
    <OperatorRoute>
      <SessionRefresh userId={userId ?? null} />
      <PortalShell
        variant="operator"
        navItems={OPERATOR_NAV}
        userName={displayName}
        onLogout={logoutDiscardingUnsaved}
        status={<UnsavedWritesIndicator />}
        logoutWarning={unsavedLogoutWarning(entries.length)}
      >
        {children}
      </PortalShell>
    </OperatorRoute>
  );
}
