'use client';

import { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import OperatorRoute from '@/app/components/OperatorRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import PageHeader from '@/app/operator/components/PageHeader';
import { Field } from '@/app/components/ui/forms/Field';
import { Select } from '@/app/components/ui/forms/Select';
import { ServiceCalendar } from '@/app/components/ServiceCalendar';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';
import type { Customer } from '@/amplify/types';
import styles from './page.module.css';

export default function OperatorCalendarPage() {
  const { user } = useAuthenticator();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void listAllCustomers({ limit: 200 }).then((result) => {
      if (cancelled) return;
      const list = (result.data as Customer[]) || [];
      setCustomers(list);
      if (list.length > 0) setSelectedCustomerId(list[0].id);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);

  return (
    <OperatorRoute>
      <div>
        <PageHeader
          title="Service Calendar"
          subtitle="Block out days Null Device has no drivers available"
          actions={
            <div className={styles.customerPicker}>
              <Field label="Customer" htmlFor="calendar-customer">
                <Select
                  id="calendar-customer"
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  disabled={loading || customers.length === 0}
                >
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          }
        />

        {loading ? (
          <LoadingSpinner message="Loading customers..." />
        ) : !selectedCustomer ? (
          <p className={styles.emptyState}>No customers found.</p>
        ) : (
          <ServiceCalendar
            key={selectedCustomer.id}
            customerId={selectedCustomer.id}
            role="staff"
            currentUserSub={user?.userId || ''}
            viewerSubs={selectedCustomer.viewerSubs || []}
          />
        )}
      </div>
    </OperatorRoute>
  );
}
