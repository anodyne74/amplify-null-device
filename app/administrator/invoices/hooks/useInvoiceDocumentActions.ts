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
import type { StopSummary } from '@/app/administrator/invoices/stopFormatting';

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
        const uploadedAt = new Date().toISOString();
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
            importedAt: uploadedAt,
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
          await updateInvoice(invoiceId, { importedAt: uploadedAt });
          updateInvoiceInState(invoiceId, { pdfS3Key: s3Key, importedAt: uploadedAt });
          setUploadError('PDF uploaded, but automatic invoice parsing failed. You can still use the uploaded PDF.');
          setSuccessMessage('Invoice PDF uploaded successfully.');
        }
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
    if (invoice.importedAt) {
      setUploadError('PDF generation is disabled for manually uploaded invoices.');
      return;
    }

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
        ? ((await getRouteWithStops(invoice.routeId)).stops as StopSummary[]) ?? []
        : [];
      const groupStopsByAgentForCustomer = Boolean(customer?.groupLineItemsByAgent);
      const { jsPDF } = await import('jspdf');
      const { drawInvoicePdfDocument } = await import('@/app/administrator/invoices/invoicePdfDocument');
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
      const gstAmount = Number((invoice.gstAmount ?? 0).toFixed(2));
      // Amount before GST — invoice.totalAmount is GST-inclusive when gstAmount is set.
      const totalAmount = Number((invoice.totalAmount ?? 0).toFixed(2));
      const preGstAmount = Number((totalAmount - gstAmount).toFixed(2));
      const fallbackHours = routeDurationHours > 0
        ? routeDurationHours
        : hourlyRate > 0
          ? Number((preGstAmount / hourlyRate).toFixed(2))
          : 1;
      const fallbackRate = hourlyRate > 0
        ? hourlyRate
        : fallbackHours > 0
          ? Number((preGstAmount / fallbackHours).toFixed(2))
          : preGstAmount;

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
              total: preGstAmount,
            },
          ];

      const subtotal = Number(
        invoiceRows.reduce((sum, row) => sum + row.total, 0).toFixed(2)
      );

      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const config = buildInvoicePdfConfig();

      drawInvoicePdfDocument(doc, config, {
        invoiceNumber: invoice.invoiceNumber || invoice.id,
        invoiceDate: invoice.invoiceDate || new Date().toISOString().slice(0, 10),
        routeCode: linkedRoute?.routeCode || invoice.routeId || '—',
        logoDataUrl,
        company: {
          name: pdfCompanyName,
          abn: pdfCompanyAbn,
          phone: pdfCompanyPhone,
          address: pdfCompanyAddress,
          email: BILLING_EMAIL,
        },
        customer: {
          name: customer?.name || invoice.customerId,
          address: customer?.addressLine1 || '—',
        },
        lines: invoiceRows,
        subtotal,
        gstAmount,
        totalAmount,
        payment: {
          accountName: pdfPaymentAccountName,
          bsb: pdfPaymentBsb,
          accountNumber: pdfPaymentAccountNumber,
        },
        routeStops,
        groupStopsByAgentForCustomer,
      });

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
        updateInvoiceInState(invoice.id, { pdfS3Key: s3Key, importedAt: null });
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

      const sentAt = new Date().toISOString();
      const nextStatus = String(invoice.status ?? '').trim().toLowerCase() === 'paid' ? 'paid' : 'sent';
      const updateResult = await updateInvoice(invoice.id, {
        status: nextStatus,
        emailSentAt: sentAt,
      });

      if (updateResult.errors && updateResult.errors.length > 0) {
        setError('Invoice email sent, but status timestamp update failed. Refresh to confirm latest state.');
        return;
      }

      updateInvoiceInState(invoice.id, {
        status: nextStatus,
        emailSentAt: sentAt,
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
