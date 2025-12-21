'use client';

import type { Invoice } from '@/amplify/types';

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

  // Get status color
  const getStatusColor = (status?: string | null) => {
    switch (status) {
      case 'paid':
        return '#4caf50'; // Green
      case 'pending':
        return '#ff9800'; // Orange
      case 'overdue':
        return '#f44336'; // Red
      default:
        return '#999'; // Gray
    }
  };

  // Get status label
  const getStatusLabel = (status?: string | null) => {
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: '1px solid #e0e0e0',
        backgroundColor: '#fff',
        gap: '16px',
      }}
    >
      {/* Invoice Number */}
      <div style={{ flex: 0.8, fontWeight: '600', fontSize: '14px' }}>
        {invoice.invoiceNumber || invoice.id}
      </div>

      {/* Invoice Date */}
      <div style={{ flex: 0.9, fontSize: '14px', color: '#666' }}>
        {formatDate(invoice.invoiceDate)}
      </div>

      {/* Period */}
      <div style={{ flex: 1.2, fontSize: '13px', color: '#666' }}>
        {formatDate(invoice.periodStartDate)} to {formatDate(invoice.periodEndDate)}
      </div>

      {/* Total Amount */}
      <div style={{ flex: 0.8, fontWeight: '600', fontSize: '14px', textAlign: 'right' }}>
        {formatCurrency(invoice.totalAmount)}
      </div>

      {/* Status Badge */}
      <div
        style={{
          flex: 0.6,
          padding: '4px 8px',
          borderRadius: '4px',
          backgroundColor: getStatusColor(invoice.status),
          color: '#fff',
          fontSize: '12px',
          fontWeight: '600',
          textAlign: 'center',
        }}
      >
        {getStatusLabel(invoice.status)}
      </div>

      {/* Download Button */}
      <div style={{ flex: 0.6 }}>
        <a
          href={`/customer/invoices/${invoice.id}`}
          style={{
            padding: '8px 12px',
            backgroundColor: '#1976d2',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: '4px',
            fontSize: '13px',
            fontWeight: '600',
            display: 'inline-block',
            textAlign: 'center',
          }}
        >
          View
        </a>
      </div>
    </div>
  );
}
