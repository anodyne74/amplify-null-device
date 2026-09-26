'use client';

import { useEffect, useState } from 'react';
import { useCustomerPortalContext, type CustomerPortalContext } from '@/lib/useCustomerPortalContext';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import PageHeader from '@/app/customer/components/PageHeader';
import { InvoiceStatusPill, InvoiceActions } from '@/app/customer/components/InvoiceListItem';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Tag } from '@/app/components/ui/core/Tag';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { DataTable, type DataColumn } from '@/app/components/ui/data/DataTable';
import CustomerPagination from '@/app/customer/components/CustomerPagination';
import type { Invoice } from '@/amplify/types';
import { formatInvoiceCurrency } from '@/lib/format';
import {
  buildInvoicesCsv,
  compareInvoiceDateDesc,
  formatInvoiceDate,
  getInvoiceRouteLabel,
} from '@/lib/customerInvoiceList';
import { getPageSlice } from '@/lib/pagination';
import styles from './page.module.css';
import { getCustomer } from '@/lib/customers';
import { listMyInvoices } from '@/lib/invoices';

type StatusFilter = 'all' | 'draft' | 'sent' | 'paid';

const STATUS_CHIPS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'sent', label: 'Sent' },
  { id: 'paid', label: 'Paid' },
];

// Invoice plus the Route Code listMyInvoices resolves for it.
type InvoiceRow = Invoice & { routeCode?: string | null };

function downloadInvoicesCsv(invoices: InvoiceRow[]) {
  const csv = buildInvoicesCsv(invoices);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function fetchCustomerName(context: CustomerPortalContext): Promise<string | undefined> {
  const { data } = await getCustomer(context.customerId);
  return data?.name || undefined;
}

/**
 * Customer Invoices List Page
 * Displays all customer's invoices with filtering options
 */
export default function InvoicesPage() {
  const {
    userId,
    role,
    customerId,
    data: customerName,
    loading: contextLoading,
    error: contextError,
  } = useCustomerPortalContext({ fetchData: fetchCustomerName });
  const readOnly = role === 'read_only';

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!userId || !customerId || readOnly) {
      setInvoicesLoading(false);
      return;
    }
    let cancelled = false;

    const fetchInvoices = async () => {
      setInvoicesLoading(true);
      setInvoicesError(null);

      try {
        const result = await listMyInvoices({
          customerId,
          userSub: userId,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        });

        if (cancelled) return;

        if (result.errors && result.errors.length > 0) {
          const message = (result.errors[0] as Error | undefined)?.message;
          setInvoicesError(message?.includes('reviewer users cannot view invoices') ? 'Access denied' : 'Failed to load invoices');
          console.error('Error fetching invoices:', result.errors);
        } else {
          setInvoices((result.data as InvoiceRow[]) || []);
        }
      } catch (err) {
        if (!cancelled) {
          setInvoicesError('Failed to load invoices');
          console.error('Error fetching invoices:', err);
        }
      } finally {
        if (!cancelled) {
          setInvoicesLoading(false);
        }
      }
    };

    fetchInvoices();

    return () => {
      cancelled = true;
    };
  }, [userId, customerId, readOnly, startDate, endDate]);

  const loading = contextLoading || invoicesLoading;
  const error = invoicesError || contextError;

  // Any filter change starts the list again from its first page.
  const handleStatusChange = (status: StatusFilter) => {
    setStatusFilter(status);
    setPage(1);
  };
  const handleStartDateChange = (value: string) => {
    setStartDate(value);
    setPage(1);
  };
  const handleEndDateChange = (value: string) => {
    setEndDate(value);
    setPage(1);
  };

  const handleClearFilters = () => {
    setStartDate('');
    setEndDate('');
    setPage(1);
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

  const filteredInvoices = invoices
    .filter((invoice) => statusFilter === 'all' || invoice.status === statusFilter)
    .sort(compareInvoiceDateDesc);
  const { currentPage, pageRows } = getPageSlice(filteredInvoices, page);

  const columns: DataColumn<InvoiceRow>[] = [
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
          <a href={`/customer/routes/${invoice.routeId}`}>{getInvoiceRouteLabel(invoice)}</a>
        ) : (
          <span style={{ color: 'var(--text-subtle)' }}>—</span>
        ),
    },
    { key: 'date', header: 'Date', render: (invoice) => formatInvoiceDate(invoice.invoiceDate) },
    {
      key: 'period',
      header: 'Period',
      render: (invoice) => `${formatInvoiceDate(invoice.periodStartDate)} – ${formatInvoiceDate(invoice.periodEndDate)}`,
    },
    { key: 'total', header: 'Amount', numeric: true, render: (invoice) => formatInvoiceCurrency(invoice.totalAmount) },
    { key: 'status', header: 'Status', render: (invoice) => <InvoiceStatusPill status={invoice.status} /> },
    {
      key: 'action',
      header: '',
      width: 190,
      render: (invoice) => <InvoiceActions invoice={invoice} customerName={customerName ?? undefined} />,
    },
  ];

  return (
    <div>
      <PageHeader title="Invoices" subtitle="View and download your invoices" />

      <div className={styles.chipsRow}>
        {STATUS_CHIPS.map((chip) => (
          <Tag key={chip.id} selected={statusFilter === chip.id} onClick={() => handleStatusChange(chip.id)}>
            {chip.label}
          </Tag>
        ))}
        <div className={styles.chipsSpacer} />
        <Button
          variant="secondary"
          iconLeft="file-text"
          disabled={filteredInvoices.length === 0}
          onClick={() => downloadInvoicesCsv(filteredInvoices)}
        >
          Export CSV
        </Button>
      </div>

      <div className={styles.filterSection}>
        <Field label="Start date" htmlFor="sd">
          <Input id="sd" type="date" value={startDate} onChange={(e) => handleStartDateChange(e.target.value)} />
        </Field>
        <Field label="End date" htmlFor="ed">
          <Input id="ed" type="date" value={endDate} onChange={(e) => handleEndDateChange(e.target.value)} />
        </Field>
        <Button variant="secondary" onClick={handleClearFilters}>
          Clear filters
        </Button>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <Card padded={false}>
        <DataTable
          columns={columns}
          rows={pageRows}
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

      <CustomerPagination
        page={currentPage}
        totalItems={filteredInvoices.length}
        onPageChange={setPage}
        itemsLabel="invoices"
      />
    </div>
  );
}
