'use client';

import { useEffect, useMemo, useState } from 'react';
import { useCurrentUserId } from '@/lib/use-user-groups';
import { callApi } from '@/lib/apiClient';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import CustomerShell from '@/app/customer/components/CustomerShell';
import { fetchUserDisplayName } from '@/lib/amplify-config';
import { getUserSettings } from '@/lib/userSettings';
import { CustomerPortalContextProvider, useCustomerPortalContext } from '@/lib/useCustomerPortalContext';
import { useSessionTimeout, useLogout } from '@/app/auth/sessionManager';

const CUSTOMER_NAV = [
  { href: '/customer/dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
  { href: '/customer/routes', label: 'Routes', icon: 'route' },
  { href: '/customer/invoices', label: 'Invoices', icon: 'file-text' },
  { href: '/customer/calendar', label: 'Calendar', icon: 'calendar' },
  { href: '/customer/orders', label: 'Standing Orders', icon: 'clipboard-list' },
  { href: '/customer/billing-details', label: 'Billing Details', icon: 'receipt' },
  { href: '/customer/users', label: 'Team', icon: 'user-plus' },
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
      <CustomerLayoutContent>{children}</CustomerLayoutContent>
    </CustomerPortalContextProvider>
  );
}

// Rendered beneath CustomerPortalContextProvider so both this component's own
// useCustomerPortalContext() call and every page's below it share the one
// resolved role/customerId instead of each fetching it independently.
function CustomerLayoutContent({ children }: { children: React.ReactNode }) {
  const userId = useCurrentUserId();
  const [fallbackDisplayName, setFallbackDisplayName] = useState('');
  const [userDisplayName, setUserDisplayName] = useState('');
  const { role: customerRole } = useCustomerPortalContext();
  const { logout } = useLogout();

  useSessionTimeout();

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    void fetchUserDisplayName().then((name) => {
      if (!cancelled) setFallbackDisplayName(name || '');
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    setUserDisplayName(fallbackDisplayName);
  }, [fallbackDisplayName]);

  useEffect(() => {
    if (!userId) return;
    if (typeof getUserSettings !== 'function') return;
    let cancelled = false;

    void getUserSettings(userId)
      .then((result) => {
        const configuredName = result.data?.name?.trim();
        if (!cancelled) {
          setUserDisplayName(configuredName || fallbackDisplayName);
        }
      })
      .catch(() => {
        // Non-blocking: keep the fallback display name if settings cannot be loaded.
      });

    return () => {
      cancelled = true;
    };
  }, [fallbackDisplayName, userId]);

  useEffect(() => {
    if (!userId) return;

    callApi('/api/customer/sync-profile-access', {}).catch(() => {
        // Non-blocking: existing accounts self-heal on a later visit if this fails.
      });
  }, [userId]);

  const navItems = useMemo(
    () => (customerRole === 'read_only' ? CUSTOMER_NAV.filter((item) => !READ_ONLY_HIDDEN_PATHS.includes(item.href)) : CUSTOMER_NAV),
    [customerRole]
  );

  return (
    <ProtectedRoute requireCustomer={true}>
      <CustomerShell navItems={navItems} userEmail={userDisplayName} onLogout={logout}>
        {children}
      </CustomerShell>
    </ProtectedRoute>
  );
}

