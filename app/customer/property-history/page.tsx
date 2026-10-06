'use client';

import PageHeader from '@/app/customer/components/PageHeader';
import PropertyHistoryExplorer from '@/app/components/PropertyHistoryExplorer';
import { useCustomerPortalContext } from '@/lib/useCustomerPortalContext';
import { RequireFeature } from '@/lib/useFeatureFlags';
import styles from './page.module.css';

const routeHref = (routeId: string) => `/customer/routes/${routeId}`;
const invoiceHref = (invoiceId: string) => `/customer/invoices/${invoiceId}`;

/**
 * Property History for a customer user (#290): their own Customer's Visits to
 * a suburb, street or address. The search API scopes it to their Customer and
 * refuses it while the Property History flag is off; this page also hides
 * behind the flag. Only Account Owners get invoice links, as only they can
 * open invoices, and only they get Export and the Reports tab (#291).
 */
export default function CustomerPropertyHistoryPage() {
  return (
    <RequireFeature flag="property-history">
      <CustomerPropertyHistory />
    </RequireFeature>
  );
}

function CustomerPropertyHistory() {
  const { role, loading } = useCustomerPortalContext();
  const accountOwner = !loading && role === 'account_owner';

  return (
    <div className={styles.page}>
      <PageHeader title="Property History" subtitle="Every visit to a suburb, street or address" />
      <PropertyHistoryExplorer
        staff={false}
        reports={accountOwner}
        routeHref={routeHref}
        invoiceHref={accountOwner ? invoiceHref : undefined}
      />
    </div>
  );
}
