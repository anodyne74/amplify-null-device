'use client';

import { useCurrentUserId } from '@/lib/use-user-groups';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import PageHeader from '@/app/customer/components/PageHeader';
import { ServiceCalendar } from '@/app/components/ServiceCalendar';
import { getCustomer } from '@/lib/queries';
import { useCustomerPortalContext, type CustomerPortalContext } from '@/lib/useCustomerPortalContext';

async function fetchViewerSubs(context: CustomerPortalContext): Promise<string[]> {
  const result = await getCustomer(context.customerId);
  return (result.data?.viewerSubs as string[] | null) || [];
}

export default function CustomerCalendarPage() {
  const userId = useCurrentUserId();
  const { role, customerId, data: viewerSubs, loading } = useCustomerPortalContext({
    fetchData: fetchViewerSubs,
  });

  if (loading) {
    return <LoadingSpinner message="Loading calendar..." />;
  }

  return (
    <ProtectedRoute>
      <div>
        <PageHeader title="Calendar" subtitle="When we deliver, and when we don't" />
        {customerId && userId && (
          <ServiceCalendar
            customerId={customerId}
            role={role === 'account_owner' ? 'customer-admin' : 'customer-readonly'}
            currentUserSub={userId}
            viewerSubs={viewerSubs ?? []}
          />
        )}
      </div>
    </ProtectedRoute>
  );
}
