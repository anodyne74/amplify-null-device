'use client';

import type { Invoice } from '@/amplify/types';
import styles from './InvoiceListItem.module.css';

interface InvoiceListItemProps {
  invoice: Invoice;
}

/**
 * InvoiceListItem component
 * Displays individual invoice in list format
 */
export default function InvoiceListItem({ invoice }: InvoiceListItemProps) {
  // Format currency
  const formatCurrency = (amount?: number | null) => {
    if (amount === null || amount === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Format date
  const formatDate = (dateString?: string | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Get status label
  const getStatusLabel = (status?: string | null) => {
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
  };

  const statusClass =
    (({ paid: styles.badgeCompleted, pending: styles.badgePlanned, overdue: styles.badgeDanger, cancelled: styles.badgeDanger, draft: styles.badgeArchived, sent: styles.badgePlanned, viewed: styles.badgePlanned } as Record<string, string>)[invoice.status ?? '']) ?? styles.badgeArchived;

  return (
    <div className={styles.row}>
      {/* Invoice Number */}
      <div className={styles.colId}>
        {invoice.invoiceNumber || invoice.id}
      </div>

      {/* Route Link */}
      <div className={styles.colRoute}>
        {invoice.routeId ? (
          <a href={`/customer/routes/${invoice.routeId}`} className={styles.routeLink}>
            View Route
          </a>
        ) : (
          <span className={styles.routeMuted}>—</span>
        )}
      </div>

      {/* Invoice Date */}
      <div className={styles.colDate}>
        {formatDate(invoice.invoiceDate)}
      </div>

      {/* Period */}
      <div className={styles.colPeriod}>
        {formatDate(invoice.periodStartDate)} to {formatDate(invoice.periodEndDate)}
      </div>

      {/* Total Amount */}
      <div className={styles.colAmount}>
        {formatCurrency(invoice.totalAmount)}
      </div>

      {/* Status Badge */}
      <div className={styles.colStatus}>
        <span className={`${styles.badge} ${statusClass}`}>
          {getStatusLabel(invoice.status)}
        </span>
      </div>

      {/* View Button */}
      <div className={styles.colAction}>
        <a
          href={`/customer/invoices/${invoice.id}`}
          className={styles.viewLink}
        >
          View
        </a>
      </div>
    </div>
  );
}
