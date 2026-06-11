import type { ChangeEvent, MutableRefObject, RefObject } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { getUrl, uploadData } from 'aws-amplify/storage';
import type { Route } from '@/amplify/types';
import { buildInvoicePdfConfig } from '@/app/administrator/invoices/invoicePdfTheme';
import type { CustomerOption, Invoice } from '@/app/administrator/invoices/types';
import { DEFAULT_COMPANY_BILLING_DETAILS } from '@/lib/companyBilling';
import { extractScheduleText } from '@/lib/extractScheduleText';
import { parseInvoiceText } from '@/lib/parseInvoice';
import { BILLING_EMAIL } from '@/lib/publicAppConfig';
import { getInvoiceWithLineItems, getRouteWithStops, updateInvoice, updateInvoicePdfKey } from '@/lib/queries';

type UseInvoiceDocumentActionsParams = {
  customers: CustomerOption[];
  routes: Route[];
  invoices: Invoice[];
  fileInputRef: RefObject<HTMLInputElement | null>;
  pendingUploadInvoiceIdRef: MutableRefObject<string | null>;
  setPendingUploadInvoiceId: (value: string | null) => void;
  setUploadingId: (value: string | null) => void;
  setUploadError: (value: string | null) => void;
  setSuccessMessage: (value: string | null) => void;
  setPdfActionLoadingId: (value: string | null) => void;
  setEmailingInvoiceId: (value: string | null) => void;
  setError: (value: string | null) => void;
  updateInvoiceInState: (invoiceId: string, updates: Partial<Invoice>) => void;
  billingCompanyName: string;
  billingAbn: string;
  billingPhone: string;
  billingCompanyAddress: string;
  billingPaymentAccountName: string;
  billingBsb: string;
  billingAccountNumber: string;
};

function getInvoicePdfKey(invoice: Invoice) {
  return invoice.pdfS3Key ?? null;
}

function formatStopProperty(stop: {
  formattedAddress?: string | null;
  address?: string | null;
  sequence?: number | null;
}) {
  const baseAddress = (stop.formattedAddress || stop.address || 'Unknown property').trim();
  const parts = baseAddress
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) =>
      part
        .replace(/\b(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b\s*\d{4}\b/gi, '')
        .replace(/\bAustralia\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean);

  if (parts.length === 0) return 'Unknown property';
  if (parts.length === 1) return parts[0];
  return `${parts[0]}, ${parts[1]}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Unable to convert image blob to data URL.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read image blob.'));
    reader.readAsDataURL(blob);
  });
}

async function fetchRouteMapDataUrl(
  stops: Array<{ latitude?: number | null; longitude?: number | null; sequence?: number | null }>
) {
  const markers = stops
    .filter((stop) => typeof stop.latitude === 'number' && typeof stop.longitude === 'number')
    .map((stop) => ({
      latitude: stop.latitude as number,
      longitude: stop.longitude as number,
      sequence: stop.sequence ?? null,
    }));

  if (markers.length === 0) {
    return null;
  }

  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    const response = await fetch('/api/admin/static-route-map', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ markers }),
    });

    if (!response.ok) {
      return null;
    }

    const imageBlob = await response.blob();
    return await blobToDataUrl(imageBlob);
  } catch {
    return null;
  }
}

async function fetchLogoDataUrl() {
  try {
    const response = await fetch('/logo.svg');
    if (!response.ok) return null;

    const svgText = await response.text();
    const svgBase64 = btoa(unescape(encodeURIComponent(svgText)));
    const svgDataUrl = `data:image/svg+xml;base64,${svgBase64}`;

    return await new Promise<string | null>((resolve) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        if (!context) {
          resolve(null);
          return;
        }

        context.drawImage(image, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      image.onerror = () => resolve(null);
      image.src = svgDataUrl;
    });
  } catch {
    return null;
  }
}

export function useInvoiceDocumentActions({
  customers,
  routes,
  invoices,
  fileInputRef,
  pendingUploadInvoiceIdRef,
  setPendingUploadInvoiceId,
  setUploadingId,
  setUploadError,
  setSuccessMessage,
  setPdfActionLoadingId,
  setEmailingInvoiceId,
  setError,
  updateInvoiceInState,
  billingCompanyName,
  billingAbn,
  billingPhone,
  billingCompanyAddress,
  billingPaymentAccountName,
  billingBsb,
  billingAccountNumber,
}: UseInvoiceDocumentActionsParams) {
  const handleUploadClick = (invoiceId: string) => {
    pendingUploadInvoiceIdRef.current = invoiceId;
    setPendingUploadInvoiceId(invoiceId);
    setUploadError(null);
    setSuccessMessage(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const invoiceId = pendingUploadInvoiceIdRef.current;
    if (!file || !invoiceId) return;
    if (file.type !== 'application/pdf') {
      setUploadError('Only PDF files are accepted.');
      return;
    }

    setUploadingId(invoiceId);
    setUploadError(null);
    setSuccessMessage(null);

    try {
      const s3Key = `invoices/${invoiceId}.pdf`;
      await uploadData({
        path: s3Key,
        data: file,
        options: { contentType: 'application/pdf' },
      }).result;

      const keyResult = await updateInvoicePdfKey(invoiceId, s3Key);
      if (keyResult.errors && keyResult.errors.length > 0) {
        setUploadError('Uploaded to S3 but failed to save key on invoice.');
      } else {
        try {
          const parsedText = await extractScheduleText(file);
          const parsed = parseInvoiceText(parsedText);
          const existingInvoice = invoices.find((invoice) => invoice.id === invoiceId);

          const parsedRouteId = parsed.routeCode
            ? routes.find(
                (route) =>
                  route.routeCode?.toUpperCase() === parsed.routeCode &&
                  (!existingInvoice?.customerId || route.customerId === existingInvoice.customerId)
              )?.id
            : undefined;

          const parsedUpdates: Parameters<typeof updateInvoice>[1] = {
            pdfS3Key: s3Key,
          };

          if (parsed.invoiceNumber) parsedUpdates.invoiceNumber = parsed.invoiceNumber;
          if (parsed.invoiceDate) parsedUpdates.invoiceDate = parsed.invoiceDate;
          if (typeof parsed.totalAmount === 'number') parsedUpdates.totalAmount = parsed.totalAmount;
          if (parsedRouteId) parsedUpdates.routeId = parsedRouteId;

          await updateInvoice(invoiceId, parsedUpdates);
          updateInvoiceInState(invoiceId, parsedUpdates as Partial<Invoice>);
          setSuccessMessage('Invoice PDF uploaded and invoice metadata updated.');
        } catch (parseError) {
          console.warn('PDF uploaded but auto-parse failed:', parseError);
          setUploadError('PDF uploaded, but automatic invoice parsing failed. You can still use the uploaded PDF.');
          setSuccessMessage('Invoice PDF uploaded successfully.');
        }

        updateInvoiceInState(invoiceId, { pdfS3Key: s3Key });
      }
    } catch (err) {
      console.error('Upload error:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      setUploadError(`PDF upload failed. ${message}`);
    } finally {
      setUploadingId(null);
      setPendingUploadInvoiceId(null);
      pendingUploadInvoiceIdRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePdfAction = async (invoice: Invoice, action: 'view' | 'download') => {
    const pdfKey = getInvoicePdfKey(invoice);
    if (!pdfKey) {
      setUploadError('No PDF is attached to this invoice yet. Please generate or upload one first.');
      return;
    }

    setPdfActionLoadingId(invoice.id);
    setUploadError(null);

    try {
      const { url } = await getUrl({
        path: pdfKey,
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
      console.error('Invoice PDF action failed:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      setUploadError(`Unable to open invoice PDF. ${message}`);
    } finally {
      setPdfActionLoadingId(null);
    }
  };

  const handleGeneratePdf = async (invoice: Invoice) => {
    setUploadingId(invoice.id);
    setUploadError(null);
    setSuccessMessage(null);

    try {
      const customer = customers.find((entry) => entry.id === invoice.customerId);
      const linkedRoute = routes.find((route) => route.id === invoice.routeId);
      const detail = await getInvoiceWithLineItems(invoice.id);
      const lineItems = (detail.lineItems as Array<{
        description?: string | null;
        quantity?: number | null;
        ratePerUnit?: number | null;
        amount?: number | null;
      }>) ?? [];
      const routeStops = invoice.routeId
        ? ((await getRouteWithStops(invoice.routeId)).stops as Array<{
            sequence?: number | null;
            address?: string | null;
            formattedAddress?: string | null;
            agent?: string | null;
            numberOfSigns?: number | null;
            latitude?: number | null;
            longitude?: number | null;
          }>) ?? []
        : [];
      const { jsPDF } = await import('jspdf');
      const { autoTable } = await import('jspdf-autotable');
      const logoDataUrl = await fetchLogoDataUrl();
      const pdfCompanyName = billingCompanyName.trim() || DEFAULT_COMPANY_BILLING_DETAILS.companyName;
      const pdfCompanyAbn = billingAbn.trim() || DEFAULT_COMPANY_BILLING_DETAILS.abn;
      const pdfCompanyPhone = billingPhone.trim() || DEFAULT_COMPANY_BILLING_DETAILS.phone;
      const pdfCompanyAddress = billingCompanyAddress.trim() || DEFAULT_COMPANY_BILLING_DETAILS.companyAddress;
      const pdfPaymentAccountName = billingPaymentAccountName.trim() || pdfCompanyName;
      const pdfPaymentBsb = billingBsb.trim() || DEFAULT_COMPANY_BILLING_DETAILS.bsb;
      const pdfPaymentAccountNumber = billingAccountNumber.trim() || DEFAULT_COMPANY_BILLING_DETAILS.accountNumber;

      const routeDurationHours = linkedRoute
        ? Number((((linkedRoute.overrideDurationMinutes ?? linkedRoute.actualDurationMinutes ?? 0) / 60)).toFixed(2))
        : 0;
      const hourlyRate = Number((customer?.billingRatePerHour ?? 0).toFixed(2));
      const fallbackHours = routeDurationHours > 0
        ? routeDurationHours
        : hourlyRate > 0
          ? Number((invoice.totalAmount / hourlyRate).toFixed(2))
          : 1;
      const fallbackRate = hourlyRate > 0
        ? hourlyRate
        : fallbackHours > 0
          ? Number((invoice.totalAmount / fallbackHours).toFixed(2))
          : Number(invoice.totalAmount.toFixed(2));

      const invoiceRows = lineItems.length > 0
        ? lineItems.map((item) => {
            const quantity = Number((item.quantity ?? 0).toFixed(2));
            const rate = Number((item.ratePerUnit ?? 0).toFixed(2));
            const amount = typeof item.amount === 'number'
              ? Number(item.amount.toFixed(2))
              : Number((quantity * rate).toFixed(2));
            return {
              description: item.description || 'Service line',
              quantityHours: quantity,
              hourlyRate: rate,
              total: amount,
            };
          })
        : [
            {
              description: linkedRoute?.routeCode
                ? `Route ${linkedRoute.routeCode} services`
                : 'General services',
              quantityHours: fallbackHours,
              hourlyRate: fallbackRate,
              total: Number(invoice.totalAmount.toFixed(2)),
            },
          ];

      const subtotal = Number(
        invoiceRows.reduce((sum, row) => sum + row.total, 0).toFixed(2)
      );

      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const config = buildInvoicePdfConfig();

      let y = config.margins.top;
      const ensurePageSpace = (requiredHeight: number) => {
        if (y + requiredHeight <= 780) return;
        doc.addPage();
        y = config.margins.top;
      };

      doc.setFillColor(...config.colors.header);
      doc.rect(0, 0, 595, 112, 'F');

      if (logoDataUrl) {
        doc.addImage(logoDataUrl, 'PNG', 28, 0, 280, 128);
      }

      doc.setTextColor(...config.colors.headerText);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(config.fonts.xlarge);
      doc.text('INVOICE', 540, 52, { align: 'right' });

      doc.setFontSize(config.fonts.small);
      doc.setFont('helvetica', 'normal');
      doc.text(pdfCompanyName, 540, 72, { align: 'right' });
      doc.text(pdfCompanyAbn, 540, 86, { align: 'right' });
      doc.text(pdfCompanyPhone, 540, 100, { align: 'right' });
      doc.text(pdfCompanyAddress, 540, 114, { align: 'right' });

      y = 150;

      doc.setTextColor(...config.colors.text);

      doc.setFillColor(...config.colors.secondary);
      doc.roundedRect(config.margins.left, y - 20, 484, 142, 8, 8, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Bill To', config.margins.left + 12, y + 2);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(`${customer?.name || invoice.customerId}`, config.margins.left + 12, y + 20);

      const customerAddressLines = doc.splitTextToSize(
        `${customer?.addressLine1 || '—'}`.split(',').map((line) => line.trim()).join('\n'),
        320
      );
      doc.text(customerAddressLines, config.margins.left + 12, y + 38);
      const customerAddressHeight = customerAddressLines.length * 13;
      const customerEmailY = y + 38 + customerAddressHeight + 4;
      doc.text(`Route: ${linkedRoute?.routeCode || invoice.routeId || '—'}`, config.margins.left + 12, customerEmailY + 18);

      doc.setFont('helvetica', 'normal');
      doc.text(`Date: ${invoice.invoiceDate || new Date().toISOString().slice(0, 10)}`, 360, y + 2);
      doc.setFont('helvetica', 'bold');
      doc.text(`Invoice: ${invoice.invoiceNumber || invoice.id}`, 360, y + 20);

      y += 160;

      doc.setFillColor(...config.colors.totalBand);
      doc.roundedRect(config.margins.left, y - 16, 484, 54, 6, 6, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Total Amount Due', config.margins.left + 12, y + 6);
      doc.setFontSize(19);
      doc.text(`$${invoice.totalAmount.toFixed(2)}`, 500, y + 8, { align: 'right' });

      y += 56;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(
        'Please quote the invoice number in all correspondence. Payment terms are due on receipt unless otherwise agreed.',
        config.margins.left,
        y,
        { maxWidth: 484 }
      );

      y += 20;
      doc.line(config.margins.left, y, config.margins.right, y);

      y += 16;

      y += 34;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Invoice Lines', config.margins.left, y);

      y += 18;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Description', config.margins.left, y);
      doc.text('Qty (Hours)', 340, y);
      doc.text('Rate', 430, y, { align: 'right' });
      doc.text('Total', 540, y, { align: 'right' });

      y += 8;
      doc.setLineWidth(0.6);
      doc.line(config.margins.left, y, 540, y);

      for (const row of invoiceRows) {
        ensurePageSpace(24);

        y += 18;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(row.description, config.margins.left, y, { maxWidth: 260 });
        doc.text(`${row.quantityHours.toFixed(2)}`, 340, y);
        doc.text(`$${row.hourlyRate.toFixed(2)}`, 430, y, { align: 'right' });
        doc.text(`$${row.total.toFixed(2)}`, 540, y, { align: 'right' });
      }

      ensurePageSpace(30);
      y += 16;
      doc.setLineWidth(0.6);
      doc.line(330, y, 540, y);
      y += 16;
      doc.setFont('helvetica', 'bold');
      doc.text('Subtotal', 430, y, { align: 'right' });
      doc.text(`$${subtotal.toFixed(2)}`, 540, y, { align: 'right' });

      ensurePageSpace(84);
      y += 30;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Payment Details', config.margins.left, y);

      y += 18;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Name:    ${pdfPaymentAccountName}`, config.margins.left, y);
      y += 14;
      doc.text(`BSB:     ${pdfPaymentBsb}`, config.margins.left, y);
      y += 14;
      doc.text(`Account: ${pdfPaymentAccountNumber}`, config.margins.left, y);

      if (routeStops.length > 0) {
        ensurePageSpace(84);
        y += 34;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text('Route Stop Details', config.margins.left, y);

        y += 18;
        autoTable(doc, {
          startY: y,
          head: [['Property', 'Agent', 'Signs']],
          body: routeStops.map((stop) => [
            formatStopProperty(stop),
            stop.agent?.trim() || '—',
            typeof stop.numberOfSigns === 'number' ? String(stop.numberOfSigns) : '—',
          ]),
          theme: 'striped',
          margin: { left: config.margins.left, right: config.margins.right },
          styles: { font: 'helvetica', fontSize: 10, textColor: config.colors.text, fillColor: config.colors.secondary },
          headStyles: { fillColor: config.colors.tableHead, textColor: config.colors.text, fontStyle: 'bold' },
          columnStyles: {
            0: { cellWidth: 350 },
            1: { cellWidth: 84 },
            2: { cellWidth: 50, halign: 'right' },
          },
          didParseCell: (data) => {
            if (data.section === 'head' && data.column.index === 2) {
              data.cell.styles.halign = 'right';
            }
          },
        });

        ensurePageSpace(290);
        y += 34;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text('Route Map', config.margins.left, y);

        y += 12;
        const mapImageDataUrl = await fetchRouteMapDataUrl(routeStops);
        if (mapImageDataUrl) {
          y += 8;
          doc.addImage(mapImageDataUrl, 'PNG', config.margins.left, y, 484, 260);
          y += 268;
        } else {
          y += 18;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.text('Map image unavailable for this route.', config.margins.left, y);
        }
      }

      const totalPages = doc.getNumberOfPages();
      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        doc.setPage(pageNumber);
        doc.setDrawColor(...config.colors.border);
        doc.line(config.margins.left, 812, 540, 812);
        doc.setTextColor(...config.colors.muted);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`${pdfCompanyName} | ${pdfCompanyAbn} | ${pdfCompanyPhone} | ${BILLING_EMAIL}`, config.margins.left, 826);
        doc.text(`Page ${pageNumber} of ${totalPages}`, 540, 826, { align: 'right' });
      }

      const pdfBlob = doc.output('blob');
      const s3Key = `invoices/${invoice.id}.pdf`;
      await uploadData({
        path: s3Key,
        data: pdfBlob,
        options: { contentType: 'application/pdf' },
      }).result;

      const keyResult = await updateInvoicePdfKey(invoice.id, s3Key);
      if (keyResult.errors && keyResult.errors.length > 0) {
        setUploadError('Generated PDF uploaded but failed to save key on invoice.');
      } else {
        updateInvoiceInState(invoice.id, { pdfS3Key: s3Key });
        setSuccessMessage(`Invoice ${invoice.invoiceNumber} PDF generated successfully.`);
      }
    } catch (err) {
      console.error('PDF generation failed:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      setUploadError(`Unable to generate invoice PDF. ${message}`);
    } finally {
      setUploadingId(null);
    }
  };

  const handleEmailInvoiceToPrimary = async (invoice: Invoice) => {
    const customer = customers.find((entry) => entry.id === invoice.customerId);
    const primaryEmail = customer?.primaryEmail;

    if (!primaryEmail) {
      setError('Primary customer email is not available for this invoice.');
      return;
    }

    if (!invoice.pdfS3Key) {
      setError('Upload an invoice PDF before emailing the customer.');
      return;
    }

    setEmailingInvoiceId(invoice.id);
    setError(null);
    setSuccessMessage(null);

    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (!idToken) {
        setError('Authentication required. Please log in again.');
        return;
      }

      const response = await fetch('/api/admin/send-invoice-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          invoiceId: invoice.id,
          recipientEmail: primaryEmail,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `Failed to send email (status ${response.status})`;
        setError(errorMessage);
        return;
      }

      const result = await response.json();
      setError(null);
      setSuccessMessage(`Invoice ${invoice.invoiceNumber} emailed to ${result.sentTo}.`);

      updateInvoiceInState(invoice.id, {
        status: 'sent',
        emailSentAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Email invoice action failed:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Unable to send invoice email. ${message}`);
    } finally {
      setEmailingInvoiceId(null);
    }
  };

  return {
    handleUploadClick,
    handleFileChange,
    handlePdfAction,
    handleGeneratePdf,
    handleEmailInvoiceToPrimary,
  };
}
