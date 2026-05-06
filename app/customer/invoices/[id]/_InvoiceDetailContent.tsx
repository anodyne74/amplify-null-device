'use client';

import { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useRouter } from 'next/navigation';
import { getInvoiceDetail, type InvoiceDetail } from '@/lib/queries/GetInvoiceDetail';
import InvoiceLineItems from '@/app/customer/components/InvoiceLineItems';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import styles from './_InvoiceDetailContent.module.css';

interface InvoiceDetailContentProps {
  params: {
    id: string;
  };
}

/**
 * Invoice Detail Page
 * Displays invoice with line items and download option
 */
export default function InvoiceDetailContent({ params }: InvoiceDetailContentProps) {
  const { user } = useAuthenticator();
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Guard: redirect reviewers away from invoice pages
  useEffect(() => {
    if (!user?.userId) return;
    import('@/lib/queries').then(({ getCustomerPortalContext }) => {
      getCustomerPortalContext(user.userId).then(({ role }) => {
        if (role === 'read_only') {
          router.replace('/customer/dashboard');
        }
      });
    });
  }, [user?.userId, router]);

  useEffect(() => {
    if (!user?.userId) return;

    const fetchInvoice = async () => {
      setLoading(true);
      setError(null);

      const result = await getInvoiceDetail({
        invoiceId: params.id,
        customerId: user.userId,
        userSub: user.userId,
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
    if (!invoice?.pdfS3Key) return;
    setDownloading(true);
    try {
      const { getUrl } = await import('aws-amplify/storage');
      const { url } = await getUrl({ path: invoice.pdfS3Key });
      // Open in new tab — browser will handle PDF viewer/download
      window.open(url.toString(), '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Download error:', err);
      setError('Failed to generate download link');
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
      <div className={styles.errorWrapper}>
        <div className={styles.errorBox}>
          <p className={styles.errorMessage}>{error || 'Invoice not found'}</p>
          <button
            onClick={() => router.back()}
            className={styles.goBackBtn}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const statusClass = { paid: styles.statusPaid, overdue: styles.statusOverdue, pending: styles.statusPending }[invoice.status ?? 'pending'] ?? styles.statusPending;

  return (
    <div className={styles.container}>
      {/* Header with Back Button */}
      <div className={styles.pageHeader}>
        <button
          onClick={() => router.back()}
          className={styles.backBtn}
        >
          ← Back
        </button>
        <h1 className={styles.pageTitle}>
          Invoice {invoice.invoiceNumber || invoice.id}
        </h1>
      </div>

      {/* Invoice Info Card */}
      <div className={styles.infoCard}>
        <div className={styles.infoGrid}>
          {/* Invoice Number */}
          <div>
            <p className={styles.infoLabel}>
              Invoice Number
            </p>
            <p className={styles.infoValueBold}>
              {invoice.invoiceNumber || invoice.id}
            </p>
          </div>

          {/* Invoice Date */}
          <div>
            <p className={styles.infoLabel}>
              Invoice Date
            </p>
            <p className={styles.infoValue}>
              {formatDate(invoice.invoiceDate)}
            </p>
          </div>

          {/* Period */}
          <div>
            <p className={styles.infoLabel}>
              Period
            </p>
            <p className={styles.infoValue}>
              {formatDate(invoice.periodStartDate)} - {formatDate(invoice.periodEndDate)}
            </p>
          </div>

          {/* Status */}
          <div>
            <p className={styles.infoLabel}>
              Status
            </p>
            <p className={`${styles.infoValueBold} ${statusClass}`}>
              {invoice.status?.charAt(0).toUpperCase() + (invoice.status?.slice(1) || '')}
            </p>
          </div>
        </div>

        {/* Download Button */}
        {invoice.pdfS3Key && (
          <button onClick={handleDownloadPDF} disabled={downloading} className={styles.downloadBtn}>
            {downloading ? 'Loading...' : '📥 Download PDF'}
          </button>
        )}
      </div>

      {/* Line Items */}
      <div className={styles.lineItemsCard}>
        <InvoiceLineItems
          lineItems={invoice.lineItems || []}
          totalAmount={invoice.totalAmount}
        />
      </div>
    </div>
  );
}
