'use client';

import { useEffect, useState } from 'react';
import OperatorRoute from '@/app/components/OperatorRoute';
import PageHeader from '@/app/administrator/components/PageHeader';
import PropertyHistoryExplorer from '@/app/components/PropertyHistoryExplorer';
import { listAllCustomers } from '@/lib/customers';
import styles from './page.module.css';

const routeHref = (routeId: string) => `/administrator/routes/detail?id=${routeId}`;
const invoiceHref = (invoiceId: string) => `/administrator/invoices#invoice-${invoiceId}`;

/** Property History (#289): every Visit to a suburb, street or address, across all Customers, and its reports (#291). */
export default function AdministratorPropertyHistoryPage() {
  const [customers, setCustomers] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listAllCustomers().then((result) => {
      if (cancelled) return;
      setCustomers(
        (result.data ?? [])
          .map((customer) => ({ value: customer.id, label: customer.name || customer.id }))
          .sort((a, b) => a.label.localeCompare(b.label))
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.page}>
        <PageHeader title="Property History" subtitle="Every Visit to a suburb, street or address, across all Customers" />
        <PropertyHistoryExplorer staff reports customers={customers} routeHref={routeHref} invoiceHref={invoiceHref} />
      </div>
    </OperatorRoute>
  );
}
