'use client';

import { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { listMyInvoices } from '@/lib/queries/ListMyInvoices';
import { getCustomerPortalContext } from '@/lib/queries';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import PageHeader from '@/app/customer/components/PageHeader';
import { InvoiceStatusPill, InvoiceActions } from '@/app/customer/components/InvoiceListItem';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { DataTable, type DataColumn } from '@/app/components/ui/data/DataTable';
import type { Invoice } from '@/amplify/types';
import { formatInvoiceCurrency } from '@/lib/format';
import styles from './page.module.css';

function formatDate(dateString?: string | null) {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Customer Invoices List Page
 * Displays all customer's invoices with filtering options
 */
export default function InvoicesPage() {
  const { user } = useAuthenticator();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (!user?.userId) return;
    let cancelled = false;

    const fetchInvoices = async () => {
      setLoading(true);
      setError(null);

      try {
        const context = await getCustomerPortalContext(user.userId);

        if (context.role === 'read_only') {
          if (!cancelled) {
            setReadOnly(true);
            setInvoices([]);
          }
          return;
        }

        if (!context.customerId) {
          if (!cancelled) {
            setError('Could not resolve your customer account');
            setInvoices([]);
          }
          return;
        }

        const result = await listMyInvoices({
          customerId: context.customerId,
          userSub: user.userId,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          limit: 50,
        });

        if (cancelled) return;

        if (result.errors && result.errors.length > 0) {
          const message = (result.errors[0] as Error | undefined)?.message;
          setError(message?.includes('reviewer users cannot view invoices') ? 'Access denied' : 'Failed to load invoices');
          console.error('Error fetching invoices:', result.errors);
        } else {
          setInvoices((result.data as Invoice[]) || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load invoices');
          console.error('Error fetching invoices:', err);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchInvoices();

    return () => {
      cancelled = true;
    };
  }, [user?.userId, startDate, endDate]);

  const handleClearFilters = () => {
    setStartDate('');
    setEndDate('');
  };

  if (loading) {
    return <LoadingSpinner message="Loading invoices..." />;
  }

  if (readOnly) {
    return (
      <div>
        <PageHeader title="Invoices" subtitle="View and download your invoices" />
        <Card>
          <p className={styles.accessPanelTitle}>Invoices are available to account owners</p>
          <p className={styles.accessPanelText}>Contact your account owner for access.</p>
        </Card>
      </div>
    );
  }

  const columns: DataColumn<Invoice>[] = [
    {
      key: 'id',
      header: 'Invoice #',
      render: (invoice) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-heading)' }}>
          {invoice.invoiceNumber || invoice.id}
        </span>
      ),
    },
    {
      key: 'route',
      header: 'Route',
      render: (invoice) =>
        invoice.routeId ? (
          <a href={`/customer/routes/${invoice.routeId}`}>View Route</a>
        ) : (
          <span style={{ color: 'var(--text-subtle)' }}>—</span>
        ),
    },
    { key: 'date', header: 'Date', render: (invoice) => formatDate(invoice.invoiceDate) },
    {
      key: 'period',
      header: 'Period',
      render: (invoice) => `${formatDate(invoice.periodStartDate)} – ${formatDate(invoice.periodEndDate)}`,
    },
    { key: 'total', header: 'Amount', numeric: true, render: (invoice) => formatInvoiceCurrency(invoice.totalAmount) },
    { key: 'status', header: 'Status', render: (invoice) => <InvoiceStatusPill status={invoice.status} /> },
    {
      key: 'action',
      header: '',
      width: 190,
      render: (invoice) => <InvoiceActions invoice={invoice} />,
    },
  ];

  return (
    <div>
      <PageHeader title="Invoices" subtitle="View and download your invoices" />

      <div className={styles.filterSection}>
        <Field label="Start date" htmlFor="sd">
          <Input id="sd" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="End date" htmlFor="ed">
          <Input id="ed" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
        <Button variant="secondary" onClick={handleClearFilters}>
          Clear filters
        </Button>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <Card padded={false}>
        <DataTable
          columns={columns}
          rows={invoices}
          wrapped={false}
          empty={
            <div>
              <p className={styles.emptyStateTitle}>No invoices found</p>
              <p className={styles.emptyStateHint}>
                {startDate || endDate ? 'Try adjusting your date filters' : 'Your invoices will appear here'}
              </p>
            </div>
          }
        />
      </Card>

      {invoices.length > 0 && (
        <div className={styles.footerSummary}>
          Showing {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
