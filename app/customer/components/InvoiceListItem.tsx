'use client';

import { useState } from 'react';
import { getUrl } from 'aws-amplify/storage';
import { Badge } from '@/app/components/ui/core/Badge';
import { Button } from '@/app/components/ui/core/Button';
import type { Invoice } from '@/amplify/types';
import { getInvoiceStatusTone } from '@/lib/invoiceStatusHelpers';

function getStatusLabel(status?: string | null) {
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
}

/** Status pill for an invoice, reused by the invoices table. */
export function InvoiceStatusPill({ status }: { status?: string | null }) {
  return (
    <Badge tone={getInvoiceStatusTone(status)} dot>
      {getStatusLabel(status)}
    </Badge>
  );
}

/** PDF view/download actions (or a plain "View" link when no PDF exists yet), reused by the invoices table. */
export function InvoiceActions({ invoice }: { invoice: Pick<Invoice, 'id' | 'invoiceNumber' | 'pdfS3Key'> }) {
  const [pdfLoading, setPdfLoading] = useState(false);

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

  if (!invoice.pdfS3Key) {
    return (
      <a href={`/customer/invoices/${invoice.id}`} className="nd-btn nd-btn--ghost nd-btn--sm">
        View
      </a>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
      <Button
        size="sm"
        variant="secondary"
        iconLeft="file-text"
        disabled={pdfLoading}
        onClick={() => void handlePdfAction('view')}
      >
        View PDF
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pdfLoading}
        onClick={() => void handlePdfAction('download')}
      >
        Download
      </Button>
    </div>
  );
}
