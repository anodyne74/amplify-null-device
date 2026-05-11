'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { getUrl, uploadData } from 'aws-amplify/storage';
import { fetchAuthSession } from 'aws-amplify/auth';
import OperatorRoute from '@/app/components/OperatorRoute';
import { extractScheduleText } from '@/lib/extractScheduleText';
import { parseInvoiceText } from '@/lib/parseInvoice';
import { createInvoice, listCustomerUsers, listCustomers, listInvoices, updateInvoice, updateInvoicePdfKey } from '@/lib/queries';
import { listAllRoutes } from '@/lib/queries/ListAllRoutes';
import type { Route } from '@/amplify/types';
import styles from '@/app/dashboard.module.css';
import invoiceStyles from '@/app/administrator/invoices/page.module.css';

type CustomerOption = { id: string; name: string; email?: string; primaryEmail?: string };
type Invoice = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  routeId?: string | null;
  pdfS3Key?: string | null;
  totalAmount: number;
  status?: 'draft' | 'finalized' | 'sent' | 'paid' | null;
  emailSentAt?: string | null;
};

export default function InvoicesAdminPage() {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [totalAmount, setTotalAmount] = useState('0');

  // PDF upload state (per invoice)
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pdfActionLoadingId, setPdfActionLoadingId] = useState<string | null>(null);
  const [emailingInvoiceId, setEmailingInvoiceId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingUploadInvoiceId, setPendingUploadInvoiceId] = useState<string | null>(null);
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
      const mapped = ((customersResult.data as Array<{ id: string; name: string; email?: string }>) || []).map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
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

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!customerId) { setError('Select a customer first.'); return; }
    setSaving(true);
    setError(null);
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
        } catch (parseError) {
          console.warn('PDF uploaded but auto-parse failed:', parseError);
          setUploadError('PDF uploaded, but automatic invoice parsing failed. You can still use the uploaded PDF.');
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
      
      // Show success message with email details
      const message = `Invoice ${invoice.invoiceNumber} emailed to ${result.sentTo}`;
      setError(null);
      
      // Show a temporary success message (using alert or by updating state)
      alert(`✓ ${message}`);
      
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

        {error && (
          <div className={`${styles.infoPanel} ${invoiceStyles.alertPanel}`}>
            <p className={invoiceStyles.errorText}>{error}</p>
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
                        <button
                          type="button"
                          className={invoiceStyles.uploadButton}
                          onClick={() => handleUploadClick(invoice.id)}
                          disabled={uploadingId === invoice.id}
                        >
                          {uploadingId === invoice.id ? 'Uploading...' : 'Upload PDF'}
                        </button>
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
