'use client';

import { useEffect, useMemo } from 'react';
import { callApi } from '@/lib/apiClient';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import PortalShell, { type PortalNavItem } from '@/app/components/PortalShell';
import { usePortalUser } from '@/lib/usePortalUser';
import { CustomerPortalContextProvider, useCustomerPortalContext } from '@/lib/useCustomerPortalContext';
import { useSessionTimeout } from '@/app/auth/sessionManager';
import { FeatureFlagsProvider, useFeatureFlags } from '@/lib/useFeatureFlags';
import type { FeatureFlagName } from '@/lib/featureFlags';

// featureFlag: the entry only shows while that Feature Flag is on for the Customer.
const CUSTOMER_NAV: (PortalNavItem & { featureFlag?: FeatureFlagName })[] = [
  { href: '/customer/dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
  { href: '/customer/routes', label: 'Routes', icon: 'route' },
  { href: '/customer/invoices', label: 'Invoices', icon: 'file-text' },
  { href: '/customer/calendar', label: 'Calendar', icon: 'calendar' },
  { href: '/customer/property-history', label: 'Property History', icon: 'history', featureFlag: 'property-history' },
  { href: '/customer/route-defaults', label: 'Route Defaults', icon: 'clipboard-list' },
  { href: '/customer/billing-details', label: 'Billing Details', icon: 'receipt' },
  { href: '/customer/users', label: 'Users', icon: 'user-plus' },
  { href: '/customer/settings', label: 'Settings', icon: 'settings' },
];

const READ_ONLY_HIDDEN_PATHS = ['/customer/invoices', '/customer/billing-details', '/customer/users'];

/**
 * Customer Portal Layout
 * Provides navigation, branding, and logout for authenticated customers.
 * Includes session timeout after 30 minutes of inactivity.
 */
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    // account_owner while loading matches the pre-refactor default here: this
    // only affects nav-item visibility (READ_ONLY_HIDDEN_PATHS below), never a
    // data fetch, so showing the fuller nav briefly for the common
    // account-owner case beats flashing the reduced nav for everyone.
    <CustomerPortalContextProvider defaultRole="account_owner">
      <FeatureFlagsProvider>
        <CustomerLayoutContent>{children}</CustomerLayoutContent>
      </FeatureFlagsProvider>
    </CustomerPortalContextProvider>
  );
}

// Rendered beneath CustomerPortalContextProvider so both this component's own
// useCustomerPortalContext() call and every page's below it share the one
// resolved role/customerId instead of each fetching it independently.
function CustomerLayoutContent({ children }: { children: React.ReactNode }) {
  const { userId, displayName, logout } = usePortalUser();
  const { role: customerRole } = useCustomerPortalContext();
  const { isOn } = useFeatureFlags();

  useSessionTimeout();

  useEffect(() => {
    if (!userId) return;

    callApi('/api/customer/sync-profile-access', {}).catch(() => {
        // Non-blocking: existing accounts self-heal on a later visit if this fails.
      });
  }, [userId]);

  const navItems = useMemo(
    () =>
      CUSTOMER_NAV.filter(
        (item) =>
          (customerRole !== 'read_only' || !READ_ONLY_HIDDEN_PATHS.includes(item.href)) &&
          (!item.featureFlag || isOn(item.featureFlag))
      ),
    [customerRole, isOn]
  );

  return (
    <ProtectedRoute requireCustomer={true}>
      <PortalShell variant="customer" navItems={navItems} userName={displayName} onLogout={logout}>
        {children}
      </PortalShell>
    </ProtectedRoute>
  );
}

