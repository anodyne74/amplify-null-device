'use client';

import { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useRouter } from 'next/navigation';
import { getInvoiceDetail, type InvoiceDetail } from '@/lib/queries/GetInvoiceDetail';
import { getCustomerPortalContext } from '@/lib/queries';
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

/**
 * Invoice Detail Page
 * Displays invoice with line items and download option
 */
export default function InvoiceDetailContent({ params }: InvoiceDetailContentProps) {
  const { user } = useAuthenticator();
  const router = useRouter();
  const { showToast } = useToast();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [pdfActionLoading, setPdfActionLoading] = useState(false);

  useEffect(() => {
    if (!user?.userId) return;
    let cancelled = false;

    const fetchInvoice = async () => {
      setLoading(true);
      setError(null);

      try {
        const context = await getCustomerPortalContext(user.userId);

        if (context.role === 'read_only') {
          if (!cancelled) {
            setReadOnly(true);
          }
          return;
        }

        if (!context.customerId) {
          if (!cancelled) {
            setError('Could not resolve your customer account');
          }
          return;
        }

        const result = await getInvoiceDetail({
          invoiceId: params.id,
          customerId: context.customerId,
          userSub: user.userId,
        });

        if (cancelled) return;

        if (result.errors && result.errors.length > 0) {
          setError('Failed to load invoice');
          console.error('Error fetching invoice:', result.errors);
        } else if (!result.data) {
          setError('Invoice not found');
        } else {
          setInvoice(result.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load invoice');
          console.error('Error fetching invoice:', err);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchInvoice();

    return () => {
      cancelled = true;
    };
  }, [user?.userId, params.id]);

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
      link.download = `${invoice.invoiceNumber || invoice.id}.pdf`;
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
