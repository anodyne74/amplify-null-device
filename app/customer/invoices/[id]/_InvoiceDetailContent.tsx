'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getInvoiceDetail, type InvoiceDetail } from '@/lib/queries/GetInvoiceDetail';
import { useCustomerPortalContext, type CustomerPortalContext } from '@/lib/useCustomerPortalContext';
import { buildInvoiceFileName } from '@/lib/invoiceFileName';
import InvoiceLineItems from '@/app/customer/components/InvoiceLineItems';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import { useToast } from '@/app/components/ToastProvider';
import { InvoiceStatusPill } from '@/app/customer/components/InvoiceListItem';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import styles from './_InvoiceDetailContent.module.css';

interface InvoiceDetailContentProps {
  params: {
    id: string;
  };
}

// Read-only customer users aren't authorized to read invoices at the
// AppSync layer, so skip the fetch entirely rather than let it error.
async function fetchInvoice(context: CustomerPortalContext, invoiceId: string): Promise<InvoiceDetail | null> {
  if (context.role === 'read_only') {
    return null;
  }

  const result = await getInvoiceDetail({
    invoiceId,
    customerId: context.customerId,
    userSub: context.userId,
  });

  if (result.errors && result.errors.length > 0) {
    throw new Error('Failed to load invoice');
  }
  if (!result.data) {
    throw new Error('Invoice not found');
  }
  return result.data;
}

/**
 * Invoice Detail Page
 * Displays invoice with line items and download option
 */
export default function InvoiceDetailContent({ params }: InvoiceDetailContentProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const {
    role,
    data: invoice,
    loading,
    error,
  } = useCustomerPortalContext({
    fetchData: (context) => fetchInvoice(context, params.id),
    fetchDataDeps: [params.id],
  });
  const readOnly = role === 'read_only';
  const [pdfActionLoading, setPdfActionLoading] = useState(false);

  const handlePdfAction = async (action: 'view' | 'download') => {
    if (!invoice?.pdfS3Key) return;
    setPdfActionLoading(true);
    try {
      const { getUrl } = await import('aws-amplify/storage');
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
      link.download = buildInvoiceFileName(invoice.customerName, invoice.invoiceNumber, invoice.id);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Download error:', err);
      showToast('Could not download the invoice PDF. Please try again.', 'error');
    } finally {
      setPdfActionLoading(false);
    }
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  if (loading) {
    return <LoadingSpinner message="Loading invoice..." />;
  }

  if (readOnly) {
    return (
      <div className={styles.errorWrapper}>
        <Breadcrumbs
          items={[
            { label: 'Invoices', href: '/customer/invoices' },
            { label: 'Invoice' },
          ]}
        />
        <Card>
          <p className={styles.accessPanelTitle}>Invoices are available to account owners</p>
          <p className={styles.accessPanelText}>Contact your account owner for access.</p>
          <Button variant="secondary" onClick={() => router.back()}>
            Go Back
          </Button>
        </Card>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className={styles.errorWrapper}>
        <Breadcrumbs
          items={[
            { label: 'Invoices', href: '/customer/invoices' },
            { label: 'Invoice' },
          ]}
        />
        <div className={styles.errorBox}>
          <p className={styles.errorMessage}>{error || 'Invoice not found'}</p>
          <Button variant="danger" onClick={() => router.back()}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Breadcrumbs
        items={[
          { label: 'Invoices', href: '/customer/invoices' },
          { label: `Invoice ${invoice.invoiceNumber || invoice.id}` },
        ]}
      />

      <h1 className={styles.pageTitle}>Invoice {invoice.invoiceNumber || invoice.id}</h1>

      <div className={styles.layout}>
        <Card padded={false}>
          <div style={{ padding: 'var(--space-8)' }}>
            <div className={styles.infoGrid}>
              <div>
                <p className={styles.infoLabel}>Invoice Number</p>
                <p className={styles.infoValueBold}>{invoice.invoiceNumber || invoice.id}</p>
              </div>

              <div>
                <p className={styles.infoLabel}>Invoice Date</p>
                <p className={styles.infoValue}>{formatDate(invoice.invoiceDate)}</p>
              </div>

              <div>
                <p className={styles.infoLabel}>Period</p>
                <p className={styles.infoValue}>
                  {formatDate(invoice.periodStartDate)} - {formatDate(invoice.periodEndDate)}
                </p>
              </div>

              <div>
                <p className={styles.infoLabel}>Status</p>
                <InvoiceStatusPill status={invoice.status} />
              </div>

              {invoice.routeId && (
                <div>
                  <p className={styles.infoLabel}>Route</p>
                  <a href={`/customer/routes/${invoice.routeId}`} className={styles.routeLink}>
                    View Route →
                  </a>
                </div>
              )}
            </div>
          </div>

          <div style={{ padding: '0 var(--space-8) var(--space-8)' }}>
            <InvoiceLineItems lineItems={invoice.lineItems || []} totalAmount={invoice.totalAmount} />
          </div>
        </Card>

        <div className={styles.sidebar}>
          <Card title="Document">
            <div className={styles.sidebarActions}>
              <Button block iconLeft="file-text" disabled={!invoice.pdfS3Key || pdfActionLoading} onClick={() => void handlePdfAction('view')}>
                {pdfActionLoading ? 'Loading…' : 'View PDF'}
              </Button>
              <Button
                block
                variant="secondary"
                disabled={!invoice.pdfS3Key || pdfActionLoading}
                onClick={() => void handlePdfAction('download')}
              >
                {pdfActionLoading ? 'Loading…' : 'Download PDF'}
              </Button>
            </div>
          </Card>

          <Card title="Access">
            <p className={styles.accessText}>Only the account owner can see invoices. Read-only users are redirected to the dashboard.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
