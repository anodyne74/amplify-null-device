'use client';

import { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import PageHeader from '@/app/customer/components/PageHeader';
import { ServiceCalendar } from '@/app/components/ServiceCalendar';
import { getCustomer, getCustomerPortalContext } from '@/lib/queries';

export default function CustomerCalendarPage() {
  const { user } = useAuthenticator();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [role, setRole] = useState<'account_owner' | 'read_only'>('read_only');
  const [viewerSubs, setViewerSubs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.userId) return;
    let cancelled = false;

    void getCustomerPortalContext(user.userId)
      .then(async (context) => {
        if (cancelled) return;
        setRole(context.role);
        setCustomerId(context.customerId || null);

        if (context.customerId) {
          const result = await getCustomer(context.customerId);
          if (!cancelled) {
            setViewerSubs((result.data?.viewerSubs as string[] | null) || []);
          }
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.userId]);

  if (loading) {
    return <LoadingSpinner message="Loading calendar..." />;
  }

  return (
    <ProtectedRoute>
      <div>
        <PageHeader title="Calendar" subtitle="When we deliver, and when we don't" />
        {customerId && user?.userId && (
          <ServiceCalendar
            customerId={customerId}
            role={role === 'account_owner' ? 'customer-admin' : 'customer-readonly'}
            currentUserSub={user.userId}
            viewerSubs={viewerSubs}
          />
        )}
      </div>
    </ProtectedRoute>
  );
}
