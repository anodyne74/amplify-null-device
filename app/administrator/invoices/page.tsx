'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { uploadData } from 'aws-amplify/storage';
import OperatorRoute from '@/app/components/OperatorRoute';
import { extractScheduleText } from '@/lib/extractScheduleText';
import { parseInvoiceText } from '@/lib/parseInvoice';
import { createInvoice, listCustomers, listInvoices, updateInvoice, updateInvoicePdfKey } from '@/lib/queries';
import { listAllRoutes } from '@/lib/queries/ListAllRoutes';
import type { Route } from '@/amplify/types';
import styles from '@/app/dashboard.module.css';

type CustomerOption = { id: string; name: string };
type Invoice = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  routeId?: string | null;
  pdfS3Key?: string | null;
  totalAmount: number;
  status?: 'draft' | 'finalized' | 'sent' | 'paid' | null;
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
      const mapped = ((customersResult.data as Array<{ id: string; name: string }>) || []).map((c) => ({ id: c.id, name: c.name }));
      setCustomers(mapped);
      if (!customerId && mapped.length > 0) setCustomerId(mapped[0].id);
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

        <form className={styles.infoPanel} onSubmit={handleCreate}>
          <h3>Create Invoice</h3>

          <label>Customer</label>
          <select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setRouteId(''); }} required>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <label>Linked Route (optional)</label>
          <select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            <option value="">— None —</option>
            {customerRoutes.map((r) => (
              <option key={r.id} value={r.id}>{r.routeCode ?? r.id.slice(0, 8)}</option>
            ))}
          </select>

          <label>Invoice Number</label>
          <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-001" required />

          <label>Total Amount</label>
          <input value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} type="number" min="0" step="0.01" required />

          <button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create Invoice'}</button>
        </form>

        {error && <div className={styles.infoPanel}><p>{error}</p></div>}
        {uploadError && <div className={styles.infoPanel}><p>{uploadError}</p></div>}

        <div className={styles.infoPanel}>
          <h3>Invoice List</h3>
          {loading ? (
            <p className={styles.welcome}>Loading invoices...</p>
          ) : invoices.length === 0 ? (
            <p className={styles.welcome}>No invoices yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Invoice #</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Customer</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Route</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Total</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>PDF</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} style={{ borderTop: '1px solid var(--nd-border-subtle)' }}>
                    <td style={{ padding: '6px 8px' }}>{invoice.invoiceNumber}</td>
                    <td style={{ padding: '6px 8px' }}>{customerName(invoice.customerId)}</td>
                    <td style={{ padding: '6px 8px' }}>
                      <select
                        value={invoice.routeId ?? ''}
                        onChange={(e) => {
                          void handleRouteLink(invoice.id, e.target.value);
                        }}
                        style={{ fontSize: 12, minWidth: 140 }}
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
                    <td style={{ padding: '6px 8px' }}>${invoice.totalAmount.toFixed(2)}</td>
                    <td style={{ padding: '6px 8px' }}>
                      <select
                        value={invoice.status ?? 'draft'}
                        onChange={(e) => { void setStatus(invoice.id, e.target.value as 'draft' | 'finalized' | 'sent' | 'paid'); }}
                        style={{ fontSize: 12 }}
                      >
                        <option value="draft">draft</option>
                        <option value="finalized">finalized</option>
                        <option value="sent">sent</option>
                        <option value="paid">paid</option>
                      </select>
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      {invoice.pdfS3Key ? (
                        <span style={{ color: 'var(--nd-status-active)', fontSize: 12 }}>
                          ✓ Uploaded{' '}
                          <button
                            onClick={() => handleUploadClick(invoice.id)}
                            disabled={uploadingId === invoice.id}
                            style={{ fontSize: 11, marginLeft: 4, cursor: 'pointer' }}
                          >
                            Replace
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleUploadClick(invoice.id)}
                          disabled={uploadingId === invoice.id}
                          style={{ fontSize: 12, cursor: 'pointer' }}
                        >
                          {uploadingId === invoice.id ? 'Uploading...' : '📎 Upload PDF'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </OperatorRoute>
  );
}
