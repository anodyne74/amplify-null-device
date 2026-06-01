'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { getUrl, uploadData } from 'aws-amplify/storage';
import { fetchAuthSession } from 'aws-amplify/auth';
import { useAuthenticator } from '@aws-amplify/ui-react';
import OperatorRoute from '@/app/components/OperatorRoute';
import { extractScheduleText } from '@/lib/extractScheduleText';
import { parseInvoiceText } from '@/lib/parseInvoice';
import {
  createInvoice,
  getUserSettings,
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
import { BILLING_EMAIL } from '@/lib/publicAppConfig';
import { DEFAULT_COMPANY_BILLING_DETAILS } from '@/lib/companyBilling';
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

function normalizeInvoiceStatus(status?: Invoice['status'] | string | null) {
  return String(status ?? '').trim().toLowerCase();
}

function isInvoicePaid(status?: Invoice['status'] | string | null) {
  return normalizeInvoiceStatus(status) === 'paid';
}

function getInvoicePdfKey(invoice: Invoice) {
  return invoice.pdfS3Key || `invoices/${invoice.id}.pdf`;
}

function getNextInvoiceNumber(invoices: Invoice[]) {
  const matches = invoices
    .map((invoice) => {
      const number = invoice.invoiceNumber?.trim();
      if (!number) return null;
      const numericMatch = number.match(/(\d+)(?!.*\d)/);
      if (!numericMatch) return null;
      return {
        raw: number,
        prefix: number.slice(0, number.length - numericMatch[1].length),
        numeric: Number(numericMatch[1]),
        width: numericMatch[1].length,
      };
    })
    .filter((value): value is { raw: string; prefix: string; numeric: number; width: number } => Boolean(value));

  if (matches.length === 0) {
    return 'INV-001';
  }

  const maxNumeric = Math.max(...matches.map((entry) => entry.numeric));
  const widest = Math.max(3, ...matches.map((entry) => entry.width));
  const preferredPrefix = matches.find((entry) => entry.prefix)?.prefix ?? 'INV-';
  return `${preferredPrefix}${String(maxNumeric + 1).padStart(widest, '0')}`;
}

function getRouteDurationHours(route?: Route | null) {
  if (!route) return 0;
  const minutes = route.overrideDurationMinutes ?? route.actualDurationMinutes ?? 0;
  return Number((minutes / 60).toFixed(2));
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

export default function InvoicesAdminPage() {
  const { user } = useAuthenticator();
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
  const [invoiceNumberOverridden, setInvoiceNumberOverridden] = useState(false);
  const [totalHours, setTotalHours] = useState('0');
  const [totalAmountOverridden, setTotalAmountOverridden] = useState(false);
  const [totalAmount, setTotalAmount] = useState('0');
  const [billingCompanyName, setBillingCompanyName] = useState(DEFAULT_COMPANY_BILLING_DETAILS.companyName);
  const [billingAbn, setBillingAbn] = useState(DEFAULT_COMPANY_BILLING_DETAILS.abn);
  const [billingPhone, setBillingPhone] = useState(DEFAULT_COMPANY_BILLING_DETAILS.phone);
  const [billingCompanyAddress, setBillingCompanyAddress] = useState(DEFAULT_COMPANY_BILLING_DETAILS.companyAddress);
  const [billingPaymentAccountName, setBillingPaymentAccountName] = useState(DEFAULT_COMPANY_BILLING_DETAILS.paymentAccountName);
  const [billingBsb, setBillingBsb] = useState(DEFAULT_COMPANY_BILLING_DETAILS.bsb);
  const [billingAccountNumber, setBillingAccountNumber] = useState(DEFAULT_COMPANY_BILLING_DETAILS.accountNumber);

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
    if (!user?.userId) return;
    let cancelled = false;

    void getUserSettings(user.userId)
      .then((result) => {
        if (cancelled || !result.data) return;
        setBillingCompanyName(result.data.billingCompanyName?.trim() || DEFAULT_COMPANY_BILLING_DETAILS.companyName);
        setBillingAbn(result.data.billingAbn?.trim() || DEFAULT_COMPANY_BILLING_DETAILS.abn);
        setBillingPhone(result.data.billingPhone?.trim() || DEFAULT_COMPANY_BILLING_DETAILS.phone);
        setBillingCompanyAddress(result.data.billingCompanyAddress?.trim() || DEFAULT_COMPANY_BILLING_DETAILS.companyAddress);
        setBillingPaymentAccountName(result.data.billingPaymentAccountName?.trim() || DEFAULT_COMPANY_BILLING_DETAILS.paymentAccountName);
        setBillingBsb(result.data.billingBsb?.trim() || DEFAULT_COMPANY_BILLING_DETAILS.bsb);
        setBillingAccountNumber(result.data.billingAccountNumber?.trim() || DEFAULT_COMPANY_BILLING_DETAILS.accountNumber);
      })
      .catch(() => {
        // Non-blocking fallback to defaults.
      });

    return () => {
      cancelled = true;
    };
  }, [user?.userId]);

  useEffect(() => {
    if (!successMessage) return;

    const timeoutId = window.setTimeout(() => {
      setSuccessMessage(null);
    }, successMessageTimeoutMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [successMessage]);

  useEffect(() => {
    if (invoiceNumberOverridden) return;
    setInvoiceNumber(getNextInvoiceNumber(invoices));
  }, [invoices, invoiceNumberOverridden]);

  // Auto-populate invoice hours and amount from selected route defaults.
  useEffect(() => {
    if (!routeId) {
      setTotalHours('0');
      setTotalAmount('0');
      return;
    }

    const selectedRoute = routes.find((r) => r.id === routeId);
    if (!selectedRoute) return;

    const routeHours = getRouteDurationHours(selectedRoute);
    setTotalHours(routeHours.toFixed(2));

    if (totalAmountOverridden) {
      return;
    }

    const customer = customers.find((c) => c.id === selectedRoute.customerId);
    const rate = customer?.billingRatePerHour ?? 0;
    const amount = routeHours * rate;
    setTotalAmount(Number(amount).toFixed(2));
  }, [routeId, routes, customers, totalAmountOverridden]);

  useEffect(() => {
    if (totalAmountOverridden) return;
    const selectedRoute = routes.find((r) => r.id === routeId);
    if (!selectedRoute) return;

    const customer = customers.find((c) => c.id === selectedRoute.customerId);
    const rate = customer?.billingRatePerHour ?? 0;
    const parsedHours = Number(totalHours);
    if (!Number.isFinite(parsedHours) || parsedHours < 0) return;

    const amount = parsedHours * rate;
    setTotalAmount(Number(amount).toFixed(2));
  }, [totalHours, routeId, routes, customers, totalAmountOverridden]);

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
      invoiceNumber: invoiceNumber.trim(),
      invoiceDate: today,
      totalAmount: Number(totalAmount),
      status: 'draft',
    });
    if (result.errors && result.errors.length > 0) {
      setError('Failed to create invoice.');
    } else {
      setInvoiceNumberOverridden(false);
      setTotalAmountOverridden(false);
      setInvoiceNumber('');
      setTotalHours('0');
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
    setPdfActionLoadingId(invoice.id);
    setUploadError(null);

    try {
      const { url } = await getUrl({
        path: getInvoicePdfKey(invoice),
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
      type tupleRow = [number,number,number];

      const config = {
        margins: { top: 64, bottom: 64, left: 56, right: 540 },
        colors: {
          header: [15, 23, 42] as tupleRow,
          secondary: [248, 250, 252] as tupleRow,
          accent: [239, 246, 255] as tupleRow,
        },
        fonts: {
          regular: 'helvetica',
          bold: 'helvetica',
          default: 11, small: 10, medium: 12, large: 18, xlarge: 22
        },
      };

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

      doc.setTextColor(241, 245, 249);
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

      doc.setTextColor(...config.colors.header);

      doc.setFillColor(...config.colors.secondary);
      doc.roundedRect(config.margins.left, y - 20, 484, 142, 8, 8, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Bill To', config.margins.left + 12, y + 2);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(`${customer?.name || invoice.customerId}`, config.margins.left + 12, y + 20);
      
      const customerAddressLines = doc.splitTextToSize(
        `${customer?.addressLine1 || '—'}`.split(',').map(line => line.trim()).join('\n'),
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

      doc.setFillColor(...config.colors.accent);
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
          styles: { font: 'helvetica', fontSize: 10, textColor: [15, 23, 42], fillColor: [248, 250, 252] },
          headStyles: { fillColor: [239, 246, 255], textColor: [15, 23, 42], fontStyle: 'bold' },
          columnStyles: {
            0: { cellWidth: 350 },
            1: { cellWidth: 84 },
            2: { cellWidth: 50, halign: 'right' },
          },
          didParseCell: (data) => {
            if (data.section === 'head' && data.column.index === 2) {
              data.cell.styles.halign = 'right'; // header alignment
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
        doc.setDrawColor(203, 213, 225);
        doc.line(config.margins.left, 812, 540, 812);
        doc.setTextColor(71, 85, 105);
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
                  setTotalAmountOverridden(false);
                }}
                required
              >
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className={invoiceStyles.fieldGroup}>
              <label htmlFor="invoice-route">Linked Route</label>
              <select
                id="invoice-route"
                value={routeId}
                onChange={(e) => {
                  setRouteId(e.target.value);
                  setTotalAmountOverridden(false);
                }}
              >
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
                onChange={(e) => {
                  setInvoiceNumber(e.target.value);
                  setInvoiceNumberOverridden(true);
                }}
                placeholder="INV-001"
                required
              />
            </div>

            <div className={invoiceStyles.fieldGroup}>
              <label htmlFor="invoice-hours">Total Hours</label>
              <input
                id="invoice-hours"
                value={totalHours}
                onChange={(e) => setTotalHours(e.target.value)}
                type="number"
                min="0"
                step="0.01"
                required
              />
            </div>

            <div className={invoiceStyles.fieldGroup}>
              <label htmlFor="invoice-total">Total Amount</label>
              <input
                id="invoice-total"
                value={totalAmount}
                onChange={(e) => {
                  setTotalAmount(e.target.value);
                  setTotalAmountOverridden(true);
                }}
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
                            onClick={() => {
                              void handlePdfAction(invoice, 'view');
                            }}
                            disabled={uploadingId === invoice.id || pdfActionLoadingId === invoice.id}
                          >
                            View PDF
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
                          {!isInvoicePaid(invoice.status) && (
                            <button
                              type="button"
                              className={invoiceStyles.markPaidButton}
                              onClick={() => {
                                void handleMarkPaid(invoice.id);
                              }}
                            >
                              Mark Paid
                            </button>
                          )}
                          {invoice.pdfS3Key && (
                            <button
                              type="button"
                              className={invoiceStyles.inlineButton}
                              onClick={() => {
                                void handlePdfAction(invoice, 'view');
                              }}
                              disabled={uploadingId === invoice.id || pdfActionLoadingId === invoice.id}
                            >
                              View PDF
                            </button>
                          )}
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
