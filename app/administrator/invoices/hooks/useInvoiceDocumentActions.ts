import type { ChangeEvent, MutableRefObject, RefObject } from 'react';
import { ApiError, callApi } from '@/lib/apiClient';
import { getUrl, uploadData } from 'aws-amplify/storage';
import type { Route } from '@/amplify/types';
import { buildInvoicePdfConfig } from '@/app/administrator/invoices/invoicePdfTheme';
import type { CustomerOption, Invoice } from '@/app/administrator/invoices/types';
import { DEFAULT_COMPANY_BILLING_DETAILS } from '@/lib/companyBilling';
import { extractScheduleText } from '@/lib/extractScheduleText';
import { parseInvoiceText } from '@/lib/parseInvoice';
import { BILLING_EMAIL } from '@/lib/publicAppConfig';
import { buildInvoiceFileName } from '@/lib/invoiceFileName';
import { billToName } from '@/lib/billToName';
import type { StopSummary } from '@/app/administrator/invoices/stopFormatting';
import { getRouteWithStops } from '@/lib/routes';
import { activeStops } from '@/lib/loadChange';
import { billedTime } from '@/lib/billedTime';
import { getInvoiceWithLineItems, updateInvoice, updateInvoicePdfKey } from '@/lib/invoices';

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

      try {
        await updateInvoicePdfKey(invoiceId, s3Key);
      } catch {
        setUploadError('Uploaded to S3 but failed to save key on invoice.');
        return;
      }
      // Parse first, then write once: a failed write is a failed upload, never mistaken for a failed parse.
      const uploadedAt = new Date().toISOString();
      const updates: Parameters<typeof updateInvoice>[1] = { pdfS3Key: s3Key, importedAt: uploadedAt };
      let parsed = true;
      try {
        const invoiceText = parseInvoiceText(await extractScheduleText(file));
        const existingInvoice = invoices.find((invoice) => invoice.id === invoiceId);

        const parsedRouteId = invoiceText.routeCode
          ? routes.find(
              (route) =>
                route.routeCode?.toUpperCase() === invoiceText.routeCode &&
                (!existingInvoice?.customerId || route.customerId === existingInvoice.customerId)
            )?.id
          : undefined;

        if (invoiceText.invoiceNumber) updates.invoiceNumber = invoiceText.invoiceNumber;
        if (invoiceText.invoiceDate) updates.invoiceDate = invoiceText.invoiceDate;
        if (typeof invoiceText.totalAmount === 'number') updates.totalAmount = invoiceText.totalAmount;
        if (parsedRouteId) updates.routeId = parsedRouteId;
      } catch (parseError) {
        console.warn('PDF uploaded but auto-parse failed:', parseError);
        parsed = false;
      }

      await updateInvoice(invoiceId, updates);
      updateInvoiceInState(invoiceId, updates as Partial<Invoice>);
      if (parsed) {
        setSuccessMessage('Invoice PDF uploaded and invoice metadata updated.');
      } else {
        setUploadError('PDF uploaded, but automatic invoice parsing failed. You can still use the uploaded PDF.');
        setSuccessMessage('Invoice PDF uploaded successfully.');
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

      const customer = customers.find((entry) => entry.id === invoice.customerId);
      const link = document.createElement('a');
      link.href = urlString;
      link.download = buildInvoiceFileName(customer?.name, invoice.invoiceNumber, invoice.id);
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
      const lineItems = (detail?.lineItems as Array<{
        description?: string | null;
        quantity?: number | null;
        ratePerUnit?: number | null;
        amount?: number | null;
      }>) ?? [];
      const routeStops = invoice.routeId
        ? (activeStops((await getRouteWithStops(invoice.routeId))?.stops ?? []) as StopSummary[])
        : [];
      const groupStopsByAgentForCustomer = Boolean(customer?.groupLineItemsByAgent);
      const { jsPDF } = await import('jspdf');
      const { drawInvoicePdfDocument } = await import('@/app/administrator/invoices/invoicePdfDocument');
      const pdfCompanyName = billingCompanyName.trim() || DEFAULT_COMPANY_BILLING_DETAILS.companyName;
      const pdfCompanyAbn = billingAbn.trim() || DEFAULT_COMPANY_BILLING_DETAILS.abn;
      const pdfCompanyPhone = billingPhone.trim() || DEFAULT_COMPANY_BILLING_DETAILS.phone;
      const pdfCompanyAddress = billingCompanyAddress.trim() || DEFAULT_COMPANY_BILLING_DETAILS.companyAddress;
      const pdfPaymentAccountName = billingPaymentAccountName.trim() || pdfCompanyName;
      const pdfPaymentBsb = billingBsb.trim() || DEFAULT_COMPANY_BILLING_DETAILS.bsb;
      const pdfPaymentAccountNumber = billingAccountNumber.trim() || DEFAULT_COMPANY_BILLING_DETAILS.accountNumber;

      const routeDurationHours = linkedRoute
        ? Number(((billedTime(linkedRoute).totalMinutes ?? 0) / 60).toFixed(2))
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

      const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true, putOnlyUsedFonts: true });
      const config = buildInvoicePdfConfig();

      drawInvoicePdfDocument(doc, config, {
        invoiceNumber: invoice.invoiceNumber || invoice.id,
        invoiceDate: invoice.invoiceDate || new Date().toISOString().slice(0, 10),
        routeCode: linkedRoute?.routeCode || invoice.routeId || '—',
        company: {
          name: pdfCompanyName,
          abn: pdfCompanyAbn,
          phone: pdfCompanyPhone,
          address: pdfCompanyAddress,
          email: BILLING_EMAIL,
        },
        customer: {
          name: billToName(customer, invoice.customerId),
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

      try {
        await updateInvoicePdfKey(invoice.id, s3Key);
      } catch {
        setUploadError('Generated PDF uploaded but failed to save key on invoice.');
        return;
      }
      updateInvoiceInState(invoice.id, { pdfS3Key: s3Key, importedAt: null });
      setSuccessMessage(`Invoice ${invoice.invoiceNumber} PDF generated successfully.`);
    } catch (err) {
      console.error('PDF generation failed:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      setUploadError(`Unable to generate invoice PDF. ${message}`);
    } finally {
      setUploadingId(null);
    }
  };

  // The server decides who it goes to: the Billing email, with the billing CCs copied (#504).
  const handleEmailInvoice = async (invoice: Invoice) => {
    if (!invoice.pdfS3Key) {
      setError('Upload an invoice PDF before emailing the customer.');
      return;
    }

    setEmailingInvoiceId(invoice.id);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await callApi<{ sentTo: string; cc?: string[] }>('/api/admin/send-invoice-email', {
        invoiceId: invoice.id,
      });
      setError(null);
      const cc = result.cc?.length ? ` (cc ${result.cc.join(', ')})` : '';
      setSuccessMessage(`Invoice ${invoice.invoiceNumber} emailed to ${result.sentTo}${cc}.`);

      const sentAt = new Date().toISOString();
      const nextStatus = String(invoice.status ?? '').trim().toLowerCase() === 'paid' ? 'paid' : 'sent';
      try {
        await updateInvoice(invoice.id, {
          status: nextStatus,
          emailSentAt: sentAt,
        });
      } catch {
        setError('Invoice email sent, but status timestamp update failed. Refresh to confirm latest state.');
        return;
      }

      updateInvoiceInState(invoice.id, {
        status: nextStatus,
        emailSentAt: sentAt,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        return;
      }
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
    handleEmailInvoice,
  };
}
