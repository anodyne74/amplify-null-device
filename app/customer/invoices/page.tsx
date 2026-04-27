'use client';

import { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { listMyInvoices } from '@/lib/queries/ListMyInvoices';
import InvoiceListItem from '../components/InvoiceListItem';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import styles from './page.module.css';

/**
 * Customer Invoices List Page
 * Displays all customer's invoices with filtering options
 */
export default function InvoicesPage() {
  const { user } = useAuthenticator();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Fetch invoices on mount or when filters change
  useEffect(() => {
    if (!user?.userId) return;

    const fetchInvoices = async () => {
      setLoading(true);
      setError(null);

      const result = await listMyInvoices({
        customerId: user.userId,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        limit: 50,
      });

      if (result.errors && result.errors.length > 0) {
        setError('Failed to load invoices');
        console.error('Error fetching invoices:', result.errors);
      } else {
        setInvoices(result.data || []);
      }

      setLoading(false);
    };

    fetchInvoices();
  }, [user?.userId, startDate, endDate]);

  const handleClearFilters = () => {
    setStartDate('');
    setEndDate('');
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.headerTitle}>
          Invoices
        </h1>
        <p className={styles.headerSubtitle}>
          View and download your invoices
        </p>
      </div>

      {/* Filter Section */}
      <div className={styles.filterSection}>
        <div className={styles.filterField}>
          <label className={styles.filterLabel}>
            Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={styles.filterInput}
          />
        </div>

        <div className={styles.filterField}>
          <label className={styles.filterLabel}>
            End Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={styles.filterInput}
          />
        </div>

        <button
          onClick={handleClearFilters}
          className={styles.clearBtn}
        >
          Clear Filters
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className={styles.errorBanner}>
          {error}
        </div>
      )}

      {/* Invoice List or Empty State */}
      <div className={styles.listContainer}>
        {invoices.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateTitle}>
              No invoices found
            </p>
            <p className={styles.emptyStateHint}>
              {startDate || endDate
                ? 'Try adjusting your date filters'
                : 'Your invoices will appear here'}
            </p>
          </div>
        ) : (
          <div>
            {/* Table Header */}
            <div className={styles.tableHeader}>
              <div className={styles.colInvoiceNum}>Invoice #</div>
              <div className={styles.colDate}>Date</div>
              <div className={styles.colPeriod}>Period</div>
              <div className={styles.colAmount}>Amount</div>
              <div className={styles.colStatus}>Status</div>
              <div className={styles.colAction}></div>
            </div>

            {/* Invoice Items */}
            {invoices.map((invoice) => (
              <InvoiceListItem key={invoice.id} invoice={invoice} />
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      {invoices.length > 0 && (
        <div className={styles.footerSummary}>
          Showing {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
