'use client';

import { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useRouter } from 'next/navigation';
import { getInvoiceDetail, type InvoiceDetail } from '@/lib/queries/GetInvoiceDetail';
import InvoiceLineItems from '@/app/customer/components/InvoiceLineItems';
import LoadingSpinner from '@/app/components/LoadingSpinner';

interface InvoiceDetailPageProps {
  params: {
    id: string;
  };
}

// Required for static export with dynamic routes
export async function generateStaticParams() {
  return [];
}

/**
 * Invoice Detail Page
 * Displays invoice with line items and download option
 */
export default function InvoiceDetailPage({ params }: InvoiceDetailPageProps) {
  const { user } = useAuthenticator();
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!user?.userId) return;

    const fetchInvoice = async () => {
      setLoading(true);
      setError(null);

      const result = await getInvoiceDetail({
        invoiceId: params.id,
        customerId: user.userId,
      });

      if (result.errors && result.errors.length > 0) {
        setError('Failed to load invoice');
        console.error('Error fetching invoice:', result.errors);
      } else if (!result.data) {
        setError('Invoice not found');
      } else {
        setInvoice(result.data);
      }

      setLoading(false);
    };

    fetchInvoice();
  }, [user?.userId, params.id]);

  const handleDownloadPDF = async () => {
    if (!invoice?.id) return;

    setDownloading(true);

    try {
      const response = await fetch(`/api/invoices/${invoice.id}/download`);

      if (!response.ok) {
        throw new Error('Failed to download PDF');
      }

      // Get the blob and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `invoice-${invoice.invoiceNumber || invoice.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      setError('Failed to download PDF');
    } finally {
      setDownloading(false);
    }
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const formatCurrency = (amount?: number | null) => {
    if (amount === null || amount === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error || !invoice) {
    return (
      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
        <div
          style={{
            padding: '24px',
            backgroundColor: '#ffebee',
            color: '#c62828',
            borderRadius: '8px',
            fontSize: '14px',
          }}
        >
          <p style={{ margin: '0 0 12px 0' }}>{error || 'Invoice not found'}</p>
          <button
            onClick={() => router.back()}
            style={{
              padding: '8px 16px',
              backgroundColor: '#c62828',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header with Back Button */}
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={() => router.back()}
          style={{
            padding: '8px 12px',
            backgroundColor: '#f5f5f5',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '14px',
            cursor: 'pointer',
            color: '#666',
          }}
        >
          ← Back
        </button>
        <h1 style={{ margin: '0', fontSize: '28px', fontWeight: '700' }}>
          Invoice {invoice.invoiceNumber || invoice.id}
        </h1>
      </div>

      {/* Invoice Info Card */}
      <div
        style={{
          padding: '24px',
          backgroundColor: '#fff',
          borderRadius: '8px',
          border: '1px solid #e0e0e0',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '24px',
            marginBottom: '24px',
          }}
        >
          {/* Invoice Number */}
          <div>
            <p
              style={{
                margin: '0 0 4px 0',
                fontSize: '12px',
                fontWeight: '600',
                color: '#999',
                textTransform: 'uppercase',
              }}
            >
              Invoice Number
            </p>
            <p style={{ margin: '0', fontSize: '16px', fontWeight: '600' }}>
              {invoice.invoiceNumber || invoice.id}
            </p>
          </div>

          {/* Invoice Date */}
          <div>
            <p
              style={{
                margin: '0 0 4px 0',
                fontSize: '12px',
                fontWeight: '600',
                color: '#999',
                textTransform: 'uppercase',
              }}
            >
              Invoice Date
            </p>
            <p style={{ margin: '0', fontSize: '16px' }}>
              {formatDate(invoice.invoiceDate)}
            </p>
          </div>

          {/* Period */}
          <div>
            <p
              style={{
                margin: '0 0 4px 0',
                fontSize: '12px',
                fontWeight: '600',
                color: '#999',
                textTransform: 'uppercase',
              }}
            >
              Period
            </p>
            <p style={{ margin: '0', fontSize: '16px' }}>
              {formatDate(invoice.periodStartDate)} - {formatDate(invoice.periodEndDate)}
            </p>
          </div>

          {/* Status */}
          <div>
            <p
              style={{
                margin: '0 0 4px 0',
                fontSize: '12px',
                fontWeight: '600',
                color: '#999',
                textTransform: 'uppercase',
              }}
            >
              Status
            </p>
            <p
              style={{
                margin: '0',
                fontSize: '16px',
                fontWeight: '600',
                color: invoice.status === 'paid' ? '#4caf50' : invoice.status === 'overdue' ? '#f44336' : '#ff9800',
              }}
            >
              {invoice.status?.charAt(0).toUpperCase() + (invoice.status?.slice(1) || '')}
            </p>
          </div>
        </div>

        {/* Download Button */}
        <button
          onClick={handleDownloadPDF}
          disabled={downloading}
          style={{
            padding: '12px 24px',
            backgroundColor: '#1976d2',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: downloading ? 'not-allowed' : 'pointer',
            opacity: downloading ? 0.6 : 1,
          }}
        >
          {downloading ? 'Downloading...' : '📥 Download PDF'}
        </button>
      </div>

      {/* Line Items */}
      <div
        style={{
          padding: '24px',
          backgroundColor: '#fff',
          borderRadius: '8px',
          border: '1px solid #e0e0e0',
        }}
      >
        <InvoiceLineItems
          lineItems={invoice.lineItems || []}
          totalAmount={invoice.totalAmount}
        />
      </div>
    </div>
  );
}
