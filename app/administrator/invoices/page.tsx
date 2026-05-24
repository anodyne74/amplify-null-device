'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { getUrl, uploadData } from 'aws-amplify/storage';
import { fetchAuthSession } from 'aws-amplify/auth';
import OperatorRoute from '@/app/components/OperatorRoute';
import { extractScheduleText } from '@/lib/extractScheduleText';
import { parseInvoiceText } from '@/lib/parseInvoice';
import {
  createInvoice,
  getInvoiceWithLineItems,
  getRouteWithStops,
  listCustomerUsers,
  listCustomers,
  listInvoices,
  updateInvoice,
  updateInvoicePdfKey,
} from '@/lib/queries';
import { listAllRoutes } from '@/lib/queries/ListAllRoutes';
import type { Route } from '@/amplify/types';
import { SUPPORT_EMAIL } from '@/lib/publicAppConfig';
import styles from '@/app/dashboard.module.css';
import invoiceStyles from '@/app/administrator/invoices/page.module.css';

type CustomerOption = {
  id: string;
  name: string;
  email?: string;
  primaryEmail?: string;
  addressLine1?: string;
  billingRatePerHour?: number;
};
type Invoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate?: string | null;
  customerId: string;
  routeId?: string | null;
  pdfS3Key?: string | null;
  totalAmount: number;
  status?: 'draft' | 'finalized' | 'sent' | 'paid' | null;
  emailSentAt?: string | null;
};

const DEFAULT_COMPANY_NAME = 'Null Device';
const DEFAULT_COMPANY_ABN = 'ABN 93 374 916 783';
const DEFAULT_COMPANY_PHONE = '+61 406 199 785';
const DEFAULT_COMPANY_ADDRESS = '31 Chester Street, Epping NSW 2121';
const DEFAULT_PAYMENT_BSB = '000-000';
const DEFAULT_PAYMENT_ACCOUNT_NUMBER = '00000000';
const BILLING_DETAILS_STORAGE_KEY = 'invoiceBillingDetails';

function formatStopProperty(stop: {
  formattedAddress?: string | null;
  address?: string | null;
  sequence?: number | null;
}) {
  const baseAddress = (stop.formattedAddress || stop.address || 'Unknown property').trim();
  const sequence = typeof stop.sequence === 'number' ? `#${stop.sequence}` : null;
  return sequence ? `${sequence} ${baseAddress}` : baseAddress;
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
    const response = await fetch('/api/admin/static-route-map', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

export default function InvoicesAdminPage() {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const successMessageTimeoutMs = 5000;

  const [customerId, setCustomerId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [totalAmount, setTotalAmount] = useState('0');
  const [billingCompanyName, setBillingCompanyName] = useState(DEFAULT_COMPANY_NAME);
  const [billingAbn, setBillingAbn] = useState(DEFAULT_COMPANY_ABN);
  const [billingPhone, setBillingPhone] = useState(DEFAULT_COMPANY_PHONE);
  const [billingCompanyAddress, setBillingCompanyAddress] = useState(DEFAULT_COMPANY_ADDRESS);
  const [billingPaymentAccountName, setBillingPaymentAccountName] = useState(DEFAULT_COMPANY_NAME);
  const [billingBsb, setBillingBsb] = useState(DEFAULT_PAYMENT_BSB);
  const [billingAccountNumber, setBillingAccountNumber] = useState(DEFAULT_PAYMENT_ACCOUNT_NUMBER);

  // PDF upload state (per invoice)
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pdfActionLoadingId, setPdfActionLoadingId] = useState<string | null>(null);
  const [emailingInvoiceId, setEmailingInvoiceId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setPendingUploadInvoiceId] = useState<string | null>(null);
  const pendingUploadInvoiceIdRef = useRef<string | null>(null);

  // Routes filtered by selected customer
  const customerRoutes = routes.filter((r) => r.customerId === customerId);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [customersResult, invoicesResult, routesResult] = await Promise.all([
      listCustomers({ limit: 100 }),
      listInvoices({ limit: 100 }),
      listAllRoutes({ limit: 200 }),
    ]);

    if (customersResult.errors && customersResult.errors.length > 0) {
      setError('Failed to load customers.');
    } else {
      const mapped = ((customersResult.data as Array<{
        id: string;
        name: string;
        email?: string;
        addressLine1?: string;
        billingRatePerHour?: number;
      }>) || []).map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        addressLine1: c.addressLine1,
        billingRatePerHour: c.billingRatePerHour,
      }));

      const customersWithPrimary = await Promise.all(
        mapped.map(async (customer) => {
          const usersResult = await listCustomerUsers(customer.id);
          const customerUsers = (usersResult.data as Array<{ role?: string | null; email?: string | null }> | undefined) || [];
          const owner = customerUsers.find((row) => row.role === 'account_owner' && row.email);
          return {
            ...customer,
            primaryEmail: owner?.email ?? customer.email,
          };
        })
      );

      setCustomers(customersWithPrimary);
      if (!customerId && customersWithPrimary.length > 0) setCustomerId(customersWithPrimary[0].id);
    }

    if (!routesResult.errors || routesResult.errors.length === 0) {
      setRoutes((routesResult.data as Route[]) || []);
    }

    if (invoicesResult.errors && invoicesResult.errors.length > 0) {
      setError('Failed to load invoices.');
    } else {
      setInvoices((invoicesResult.data as Invoice[]) ?? []);
    }

    setLoading(false);
  }, [customerId]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const raw = window.localStorage.getItem(BILLING_DETAILS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{
        companyName: string;
        abn: string;
        phone: string;
        companyAddress: string;
        paymentAccountName: string;
        bsb: string;
        accountNumber: string;
      }>;

      if (parsed.companyName) setBillingCompanyName(parsed.companyName);
      if (parsed.abn) setBillingAbn(parsed.abn);
      if (parsed.phone) setBillingPhone(parsed.phone);
      if (parsed.companyAddress) setBillingCompanyAddress(parsed.companyAddress);
      if (parsed.paymentAccountName) setBillingPaymentAccountName(parsed.paymentAccountName);
      if (parsed.bsb) setBillingBsb(parsed.bsb);
      if (parsed.accountNumber) setBillingAccountNumber(parsed.accountNumber);
    } catch {
      // Ignore malformed browser storage payloads.
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const payload = {
      companyName: billingCompanyName,
      abn: billingAbn,
      phone: billingPhone,
      companyAddress: billingCompanyAddress,
      paymentAccountName: billingPaymentAccountName,
      bsb: billingBsb,
      accountNumber: billingAccountNumber,
    };

    window.localStorage.setItem(BILLING_DETAILS_STORAGE_KEY, JSON.stringify(payload));
  }, [
    billingCompanyName,
    billingAbn,
    billingPhone,
    billingCompanyAddress,
    billingPaymentAccountName,
    billingBsb,
    billingAccountNumber,
  ]);

  useEffect(() => {
    if (!successMessage) return;

    const timeoutId = window.setTimeout(() => {
      setSuccessMessage(null);
    }, successMessageTimeoutMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [successMessage]);

  // Auto-populate invoice amount from selected route's override values
  useEffect(() => {
    if (!routeId) {
      setTotalAmount('0');
      return;
    }

    const selectedRoute = routes.find((r) => r.id === routeId);
    if (!selectedRoute) return;

    // Use override amount if available, otherwise calculate from actual duration and customer's billing rate
    if (selectedRoute.overrideAmount) {
      setTotalAmount(Number(selectedRoute.overrideAmount).toFixed(2));
      return;
    }

    const customer = customers.find((c) => c.id === selectedRoute.customerId);
    if (!customer) return;

    const amount = ((selectedRoute.actualDurationMinutes ?? 0) / 60) * (customer.billingRatePerHour ?? 0);
    setTotalAmount(Number(amount).toFixed(2));
  }, [routeId, routes, customers]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!customerId) { setError('Select a customer first.'); return; }
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    const today = new Date().toISOString().slice(0, 10);
    const result = await createInvoice({
      customerId,
      routeId: routeId || undefined,
      invoiceNumber,
      invoiceDate: today,
      totalAmount: Number(totalAmount),
      status: 'draft',
    });
    if (result.errors && result.errors.length > 0) {
      setError('Failed to create invoice.');
    } else {
      setInvoiceNumber('');
      setTotalAmount('0');
      setRouteId('');
      setSuccessMessage('Invoice created successfully.');
      await fetchData();
    }
    setSaving(false);
  };

  const setStatus = async (id: string, status: 'draft' | 'finalized' | 'sent' | 'paid') => {
    const result = await updateInvoice(id, { status });
    if (result.errors && result.errors.length > 0) { setError('Failed to update status.'); return; }
    await fetchData();
  };

  const handleUploadClick = (invoiceId: string) => {
    pendingUploadInvoiceIdRef.current = invoiceId;
    setPendingUploadInvoiceId(invoiceId);
    setUploadError(null);
    setSuccessMessage(null);
    fileInputRef.current?.click();
  };

  const handleRouteLink = async (invoiceId: string, newRouteId: string) => {
    const result = await updateInvoice(invoiceId, { routeId: newRouteId || null });
    if (result.errors && result.errors.length > 0) {
      setError('Failed to update linked route.');
      return;
    }

    setInvoices((prev) =>
      prev.map((invoice) => (invoice.id === invoiceId ? { ...invoice, routeId: newRouteId || null } : invoice))
    );
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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
          const existingInvoice = invoices.find((inv) => inv.id === invoiceId);

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
          setSuccessMessage('Invoice PDF uploaded and invoice metadata updated.');
        } catch (parseError) {
          console.warn('PDF uploaded but auto-parse failed:', parseError);
          setUploadError('PDF uploaded, but automatic invoice parsing failed. You can still use the uploaded PDF.');
          setSuccessMessage('Invoice PDF uploaded successfully.');
        }

        await fetchData();
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
    if (!invoice.pdfS3Key) return;

    setPdfActionLoadingId(invoice.id);
    setUploadError(null);

    try {
      const { url } = await getUrl({ path: invoice.pdfS3Key });
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
      const logoDataUrl = await fetchLogoDataUrl();
      const pdfCompanyName = billingCompanyName.trim() || DEFAULT_COMPANY_NAME;
      const pdfCompanyAbn = billingAbn.trim() || DEFAULT_COMPANY_ABN;
      const pdfCompanyPhone = billingPhone.trim() || DEFAULT_COMPANY_PHONE;
      const pdfCompanyAddress = billingCompanyAddress.trim() || DEFAULT_COMPANY_ADDRESS;
      const pdfPaymentAccountName = billingPaymentAccountName.trim() || pdfCompanyName;
      const pdfPaymentBsb = billingBsb.trim() || DEFAULT_PAYMENT_BSB;
      const pdfPaymentAccountNumber = billingAccountNumber.trim() || DEFAULT_PAYMENT_ACCOUNT_NUMBER;

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
      const left = 56;
      let y = 64;
      const ensurePageSpace = (requiredHeight: number) => {
        if (y + requiredHeight <= 780) return;
        doc.addPage();
        y = 64;
      };

      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, 595, 112, 'F');

      if (logoDataUrl) {
        doc.addImage(logoDataUrl, 'PNG', left, 24, 140, 64);
      }

      doc.setTextColor(241, 245, 249);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.text('INVOICE', 540, 52, { align: 'right' });

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(pdfCompanyName, 540, 72, { align: 'right' });
      doc.text(pdfCompanyAbn, 540, 86, { align: 'right' });

      y = 150;

      doc.setTextColor(15, 23, 42);

      doc.setFillColor(248, 250, 252);
      doc.roundedRect(left, y - 20, 484, 142, 8, 8, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Bill To', left + 12, y + 2);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(`Company Name: ${customer?.name || invoice.customerId}`, left + 12, y + 20);
      const customerAddressLines = doc.splitTextToSize(
        `Company Address: ${customer?.addressLine1 || '—'}`,
        320
      );
      doc.text(customerAddressLines, left + 12, y + 38);
      const customerAddressHeight = customerAddressLines.length * 13;
      const customerEmailY = y + 38 + customerAddressHeight + 4;
      doc.text(`Customer Email: ${customer?.primaryEmail || customer?.email || '—'}`, left + 12, customerEmailY);
      doc.text(`Linked Route: ${linkedRoute?.routeCode || invoice.routeId || '—'}`, left + 12, customerEmailY + 18);

      doc.setFont('helvetica', 'bold');
      doc.text(`Invoice #: ${invoice.invoiceNumber || invoice.id}`, 420, y + 2);
      doc.setFont('helvetica', 'normal');
      doc.text(`Invoice Date: ${invoice.invoiceDate || new Date().toISOString().slice(0, 10)}`, 420, y + 20);
      doc.text(`Status: ${invoice.status || 'draft'}`, 420, y + 38);
      doc.text(`Contact: ${SUPPORT_EMAIL}`, 420, y + 56);

      y += 160;

      doc.setFillColor(239, 246, 255);
      doc.roundedRect(left, y - 16, 484, 54, 6, 6, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Total Amount Due', left + 12, y + 6);
      doc.setFontSize(19);
      doc.text(`$${invoice.totalAmount.toFixed(2)}`, 540, y + 8, { align: 'right' });

      y += 56;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(
        'Please quote the invoice number in all correspondence. Payment terms are due on receipt unless otherwise agreed.',
        left,
        y,
        { maxWidth: 484 }
      );

      y += 20;
      doc.setLineWidth(0.6);
      doc.line(left, y, 540, y);

      y += 16;

      y += 34;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Invoice Lines', left, y);

      y += 18;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Description', left, y);
      doc.text('Qty (Hours)', 340, y);
      doc.text('Hourly Rate', 430, y, { align: 'right' });
      doc.text('Total', 540, y, { align: 'right' });

      y += 8;
      doc.setLineWidth(0.6);
      doc.line(left, y, 540, y);

      for (const row of invoiceRows) {
        ensurePageSpace(24);

        y += 18;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(row.description, left, y, { maxWidth: 260 });
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
      doc.text('Payment Details', left, y);

      y += 18;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Name: ${pdfPaymentAccountName}`, left, y);
      y += 14;
      doc.text(`BSB: ${pdfPaymentBsb}`, left, y);
      y += 14;
      doc.text(`Account: ${pdfPaymentAccountNumber}`, left, y);
      y += 14;
      doc.text(`Contact: ${pdfCompanyPhone} | ${SUPPORT_EMAIL}`, left, y);
      y += 14;
      doc.text(`${pdfCompanyAbn} | ${pdfCompanyAddress}`, left, y, { maxWidth: 484 });

      if (routeStops.length > 0) {
        ensurePageSpace(84);
        y += 34;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text('Route Stop Details', left, y);

        y += 18;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Property', left, y);
        doc.text('Agent', 410, y);
        doc.text('Signs', 540, y, { align: 'right' });

        y += 8;
        doc.setLineWidth(0.6);
        doc.line(left, y, 540, y);

        for (const stop of routeStops) {
          ensurePageSpace(26);
          y += 18;

          const property = formatStopProperty(stop);
          const agent = stop.agent?.trim() || '—';
          const signs = typeof stop.numberOfSigns === 'number' ? String(stop.numberOfSigns) : '—';

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.text(property, left, y, { maxWidth: 320 });
          doc.text(agent, 410, y, { maxWidth: 90 });
          doc.text(signs, 540, y, { align: 'right' });
        }

        ensurePageSpace(290);
        y += 34;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text('Route Map (All Markers)', left, y);

        y += 12;
        const mapImageDataUrl = await fetchRouteMapDataUrl(routeStops);
        if (mapImageDataUrl) {
          y += 8;
          doc.addImage(mapImageDataUrl, 'PNG', left, y, 484, 260);
          y += 268;
        } else {
          y += 18;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.text('Map image unavailable for this route.', left, y);
        }
      }

      const totalPages = doc.getNumberOfPages();
      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        doc.setPage(pageNumber);
        doc.setDrawColor(203, 213, 225);
        doc.line(left, 812, 540, 812);
        doc.setTextColor(71, 85, 105);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`${pdfCompanyName} | ${pdfCompanyAbn} | ${pdfCompanyPhone} | ${SUPPORT_EMAIL}`, left, 826);
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
        setSuccessMessage(`Invoice ${invoice.invoiceNumber} PDF generated successfully.`);
        await fetchData();
      }
    } catch (err) {
      console.error('PDF generation failed:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      setUploadError(`Unable to generate invoice PDF. ${message}`);
    } finally {
      setUploadingId(null);
    }
  };

  const handleMarkPaid = async (invoiceId: string) => {
    await setStatus(invoiceId, 'paid');
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
      // Get auth token
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      
      if (!idToken) {
        setError('Authentication required. Please log in again.');
        return;
      }

      // Call backend API to send email via SES
      const response = await fetch('/api/admin/send-invoice-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
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
      
      // Refresh invoice data to pick up emailSentAt timestamp
      await fetchData();
    } catch (err) {
      console.error('Email invoice action failed:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Unable to send invoice email. ${message}`);
    } finally {
      setEmailingInvoiceId(null);
    }
  };

  // Customer name lookup
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? id.slice(0, 8);
  const routeCode = (id?: string | null) => {
    if (!id) return '—';
    const r = routes.find((r) => r.id === id);
    return r?.routeCode ?? id.slice(0, 8);
  };

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.page}>
        <h1 className={styles.heading}>Invoices</h1>

        {/* Hidden file input for PDF upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <form className={`${styles.infoPanel} ${invoiceStyles.createForm}`} onSubmit={handleCreate}>
          <h3 className={invoiceStyles.panelHeading}>Create Invoice</h3>

          <div className={invoiceStyles.createGrid}>
            <div className={invoiceStyles.fieldGroup}>
              <label htmlFor="invoice-customer">Customer</label>
              <select
                id="invoice-customer"
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  setRouteId('');
                }}
                required
              >
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className={invoiceStyles.fieldGroup}>
              <label htmlFor="invoice-route">Linked Route</label>
              <select id="invoice-route" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
                <option value="">— None —</option>
                {customerRoutes.map((r) => (
                  <option key={r.id} value={r.id}>{r.routeCode ?? r.id.slice(0, 8)}</option>
                ))}
              </select>
            </div>

            <div className={invoiceStyles.fieldGroup}>
              <label htmlFor="invoice-number">Invoice Number</label>
              <input
                id="invoice-number"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="INV-001"
                required
              />
            </div>

            <div className={invoiceStyles.fieldGroup}>
              <label htmlFor="invoice-total">Total Amount</label>
              <input
                id="invoice-total"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                type="number"
                min="0"
                step="0.01"
                required
              />
            </div>

            <div className={`${invoiceStyles.fieldGroup} ${invoiceStyles.submitGroup}`}>
              <button type="submit" className={invoiceStyles.primaryButton} disabled={saving}>
                {saving ? 'Creating...' : 'Create Invoice'}
              </button>
            </div>
          </div>
        </form>

        <div className={`${styles.infoPanel} ${invoiceStyles.createForm}`}>
          <h3 className={invoiceStyles.panelHeading}>Company Billing Details</h3>

          <div className={invoiceStyles.createGrid}>
            <div className={invoiceStyles.fieldGroup}>
              <label htmlFor="billing-company-name">Company Name</label>
              <input
                id="billing-company-name"
                value={billingCompanyName}
                onChange={(e) => setBillingCompanyName(e.target.value)}
              />
            </div>

            <div className={invoiceStyles.fieldGroup}>
              <label htmlFor="billing-abn">ABN</label>
              <input
                id="billing-abn"
                value={billingAbn}
                onChange={(e) => setBillingAbn(e.target.value)}
              />
            </div>

            <div className={invoiceStyles.fieldGroup}>
              <label htmlFor="billing-phone">Phone</label>
              <input
                id="billing-phone"
                value={billingPhone}
                onChange={(e) => setBillingPhone(e.target.value)}
              />
            </div>

            <div className={invoiceStyles.fieldGroup}>
              <label htmlFor="billing-company-address">Company Address</label>
              <input
                id="billing-company-address"
                value={billingCompanyAddress}
                onChange={(e) => setBillingCompanyAddress(e.target.value)}
              />
            </div>

            <div className={invoiceStyles.fieldGroup}>
              <label htmlFor="billing-payment-name">Payment Account Name</label>
              <input
                id="billing-payment-name"
                value={billingPaymentAccountName}
                onChange={(e) => setBillingPaymentAccountName(e.target.value)}
              />
            </div>

            <div className={invoiceStyles.fieldGroup}>
              <label htmlFor="billing-bsb">BSB</label>
              <input
                id="billing-bsb"
                value={billingBsb}
                onChange={(e) => setBillingBsb(e.target.value)}
              />
            </div>

            <div className={invoiceStyles.fieldGroup}>
              <label htmlFor="billing-account-number">Account Number</label>
              <input
                id="billing-account-number"
                value={billingAccountNumber}
                onChange={(e) => setBillingAccountNumber(e.target.value)}
              />
            </div>
          </div>
        </div>

        {error && (
          <div className={`${styles.infoPanel} ${invoiceStyles.alertPanel}`}>
            <p className={invoiceStyles.errorText}>{error}</p>
          </div>
        )}
        {successMessage && (
          <div className={`${styles.infoPanel} ${invoiceStyles.alertPanel}`}>
            <div className={invoiceStyles.successBanner}>
              <p className={invoiceStyles.successText}>{successMessage}</p>
              <button
                type="button"
                className={invoiceStyles.dismissSuccessButton}
                onClick={() => setSuccessMessage(null)}
                aria-label="Dismiss success message"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        {uploadError && (
          <div className={`${styles.infoPanel} ${invoiceStyles.alertPanel}`}>
            <p className={invoiceStyles.warningText}>{uploadError}</p>
          </div>
        )}

        <div className={`${styles.infoPanel} ${invoiceStyles.listPanel}`}>
          <h3 className={invoiceStyles.panelHeading}>Invoice List</h3>
          {loading ? (
            <p className={styles.welcome}>Loading invoices...</p>
          ) : invoices.length === 0 ? (
            <p className={styles.welcome}>No invoices yet.</p>
          ) : (
            <div className={invoiceStyles.tableWrap}>
              <table className={invoiceStyles.invoiceTable}>
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Customer</th>
                    <th>Route</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>PDF</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>{invoice.invoiceNumber}</td>
                      <td>{customerName(invoice.customerId)}</td>
                      <td>
                      <select
                        value={invoice.routeId ?? ''}
                        onChange={(e) => {
                          void handleRouteLink(invoice.id, e.target.value);
                        }}
                        className={invoiceStyles.cellSelect}
                      >
                        <option value="">— None —</option>
                        {routes
                          .filter((route) => route.customerId === invoice.customerId)
                          .map((route) => (
                            <option key={route.id} value={route.id}>
                              {routeCode(route.id)}
                            </option>
                          ))}
                      </select>
                      </td>
                      <td className={invoiceStyles.cellNumeric}>${invoice.totalAmount.toFixed(2)}</td>
                      <td>
                      <select
                        value={invoice.status ?? 'draft'}
                        onChange={(e) => { void setStatus(invoice.id, e.target.value as 'draft' | 'finalized' | 'sent' | 'paid'); }}
                        className={invoiceStyles.cellSelect}
                      >
                        <option value="draft">draft</option>
                        <option value="finalized">finalized</option>
                        <option value="sent">sent</option>
                        <option value="paid">paid</option>
                      </select>
                      </td>
                      <td className={invoiceStyles.pdfCell}>
                      {invoice.pdfS3Key ? (
                        <div className={invoiceStyles.uploadedState}>
                          <span className={invoiceStyles.uploadTag}>Uploaded</span>
                          <div className={invoiceStyles.pdfButtons}>
                            <button
                              type="button"
                              className={invoiceStyles.inlineButton}
                              onClick={() => {
                                void handleGeneratePdf(invoice);
                              }}
                              disabled={uploadingId === invoice.id || pdfActionLoadingId === invoice.id}
                            >
                              {uploadingId === invoice.id ? 'Generating...' : 'Regenerate'}
                            </button>
                            <button
                              type="button"
                              className={invoiceStyles.inlineButton}
                              onClick={() => {
                                void handlePdfAction(invoice, 'view');
                              }}
                              disabled={uploadingId === invoice.id || pdfActionLoadingId === invoice.id}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              className={invoiceStyles.inlineButton}
                              onClick={() => {
                                void handlePdfAction(invoice, 'download');
                              }}
                              disabled={uploadingId === invoice.id || pdfActionLoadingId === invoice.id}
                            >
                              Download
                            </button>
                            <button
                              type="button"
                              className={invoiceStyles.inlineButton}
                              onClick={() => handleUploadClick(invoice.id)}
                              disabled={uploadingId === invoice.id || pdfActionLoadingId === invoice.id}
                            >
                              Replace
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className={invoiceStyles.pdfButtons}>
                          <button
                            type="button"
                            className={invoiceStyles.uploadButton}
                            onClick={() => {
                              void handleGeneratePdf(invoice);
                            }}
                            disabled={uploadingId === invoice.id}
                          >
                            {uploadingId === invoice.id ? 'Generating...' : 'Generate PDF'}
                          </button>
                          <button
                            type="button"
                            className={invoiceStyles.uploadButton}
                            onClick={() => handleUploadClick(invoice.id)}
                            disabled={uploadingId === invoice.id}
                          >
                            {uploadingId === invoice.id ? 'Uploading...' : 'Upload PDF'}
                          </button>
                        </div>
                      )}
                      </td>
                      <td>
                        <div className={invoiceStyles.actionButtons}>
                          <button
                            type="button"
                            className={invoiceStyles.markPaidButton}
                            onClick={() => {
                              void handleMarkPaid(invoice.id);
                            }}
                            disabled={invoice.status === 'paid'}
                          >
                            {invoice.status === 'paid' ? 'Paid' : 'Mark Paid'}
                          </button>
                          <button
                            type="button"
                            className={invoiceStyles.emailButton}
                            onClick={() => {
                              void handleEmailInvoiceToPrimary(invoice);
                            }}
                            disabled={emailingInvoiceId === invoice.id}
                          >
                            {emailingInvoiceId === invoice.id ? 'Preparing...' : 'Email Primary'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </OperatorRoute>
  );
}
