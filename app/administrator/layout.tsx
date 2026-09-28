'use client';

import OperatorRoute from '@/app/components/OperatorRoute';
import PortalShell, { type PortalNavItem } from '@/app/components/PortalShell';
import { usePortalUser } from '@/lib/usePortalUser';

const ADMIN_NAV: PortalNavItem[] = [
  { href: '/administrator', label: 'Admin Home', icon: 'layout-dashboard' },
  { href: '/administrator/routes', label: 'Routes', icon: 'route' },
  { href: '/administrator/route-requests', label: 'Request Inbox', icon: 'mail' },
  { href: '/administrator/customers', label: 'Customers', icon: 'building-2' },
  { href: '/administrator/drivers', label: 'Drivers', icon: 'truck' },
  { href: '/administrator/invoices', label: 'Invoices', icon: 'file-text' },
  { href: '/administrator/payment-details', label: 'Payment Details', icon: 'receipt' },
  { href: '/administrator/payouts', label: 'Payouts', icon: 'wallet' },
  { href: '/administrator/calendar', label: 'Service Calendar', icon: 'calendar' },
  { href: '/administrator/locations', label: 'Location Review', icon: 'map-pin' },
  { href: '/administrator/property-history', label: 'Property History', icon: 'history' },
  { href: '/administrator/users', label: 'Users', icon: 'user' },
  { href: '/administrator/feature-flags', label: 'Feature Flags', icon: 'flag' },
  { href: '/administrator/settings', label: 'Settings', icon: 'settings' },
];

/**
 * Administrator Portal Layout
 * Provides navigation and logout for authenticated administrators.
 * Responsive design: collapsible sidebar on mobile, fixed on desktop.
 */
export default function AdministratorLayout({ children }: { children: React.ReactNode }) {
  const { displayName, logout } = usePortalUser();

  return (
    <OperatorRoute requireAdmin>
      <PortalShell variant="administrator" navItems={ADMIN_NAV} userName={displayName} onLogout={logout}>
        {children}
      </PortalShell>
    </OperatorRoute>
  );
}

