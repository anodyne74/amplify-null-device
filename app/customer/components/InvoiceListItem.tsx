'use client';

import { useState } from 'react';
import { getUrl } from 'aws-amplify/storage';
import type { Invoice } from '@/amplify/types';
import { formatInvoiceCurrency } from '@/lib/format';
import { getInvoiceStatusTone, type InvoiceStatusTone } from '@/lib/invoiceStatusHelpers';
import styles from './InvoiceListItem.module.css';

interface InvoiceListItemProps {
  invoice: Invoice;
}

/**
 * InvoiceListItem component
 * Displays individual invoice in list format
 */
export default function InvoiceListItem({ invoice }: InvoiceListItemProps) {
  const [pdfLoading, setPdfLoading] = useState(false);

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

  const toneClasses: Record<InvoiceStatusTone, string> = {
    success: styles.badgeCompleted,
    warning: styles.badgePlanned,
    danger: styles.badgeDanger,
    neutral: styles.badgeArchived,
  };
  const statusClass = toneClasses[getInvoiceStatusTone(invoice.status)];

  const handlePdfAction = async (action: 'view' | 'download') => {
    if (!invoice.pdfS3Key) return;

    setPdfLoading(true);
    try {
      const { url } = await getUrl({
        path: invoice.pdfS3Key,
        options: { validateObjectExistence: false },
      });
      const urlString = url.toString();

      if (action === 'view') {
        window.open(urlString, '_blank', 'noopener,noreferrer');
        return;
      }

      const link = document.createElement('a');
      link.href = urlString;
      link.download = `${invoice.invoiceNumber || invoice.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setPdfLoading(false);
    }
  };

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
        {formatInvoiceCurrency(invoice.totalAmount)}
      </div>

      {/* Status Badge */}
      <div className={styles.colStatus}>
        <span className={`${styles.badge} ${statusClass}`}>
          {getStatusLabel(invoice.status)}
        </span>
      </div>

      {/* View Button */}
      <div className={styles.colAction}>
        {invoice.pdfS3Key ? (
          <div className={styles.actionGroup}>
            <button
              type="button"
              className={styles.secondaryAction}
              onClick={() => {
                void handlePdfAction('view');
              }}
              disabled={pdfLoading}
            >
              View PDF
            </button>
            <button
              type="button"
              className={styles.secondaryAction}
              onClick={() => {
                void handlePdfAction('download');
              }}
              disabled={pdfLoading}
            >
              Download
            </button>
          </div>
        ) : (
          <a
            href={`/customer/invoices/${invoice.id}`}
            className={styles.viewLink}
          >
            View
          </a>
        )}
      </div>
    </div>
  );
}
