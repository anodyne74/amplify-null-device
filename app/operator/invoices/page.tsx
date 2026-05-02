'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import OperatorRoute from '@/app/components/OperatorRoute';
import { createInvoice, listCustomers, listInvoices, updateInvoice } from '@/lib/queries';
import styles from '@/app/dashboard.module.css';

type CustomerOption = { id: string; name: string };
type Invoice = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  totalAmount: number;
  status?: 'draft' | 'finalized' | 'sent' | 'paid' | null;
};

export default function InvoicesAdminPage() {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [totalAmount, setTotalAmount] = useState('0');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [customersResult, invoicesResult] = await Promise.all([
      listCustomers({ limit: 100 }),
      listInvoices({ limit: 100 }),
    ]);

    if (customersResult.errors && customersResult.errors.length > 0) {
      setError('Failed to load customers.');
    } else {
      const mapped = ((customersResult.data as Array<{ id: string; name: string }>) || []).map((c) => ({
        id: c.id,
        name: c.name,
      }));
      setCustomers(mapped);
      if (!customerId && mapped.length > 0) {
        setCustomerId(mapped[0].id);
      }
    }

    if (invoicesResult.errors && invoicesResult.errors.length > 0) {
      setError('Failed to load invoices.');
    } else {
      setInvoices((invoicesResult.data as Invoice[]) ?? []);
    }

    setLoading(false);
  }, [customerId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!customerId) {
      setError('Select a customer first.');
      return;
    }

    setSaving(true);
    setError(null);

    const today = new Date().toISOString().slice(0, 10);
    const result = await createInvoice({
      customerId,
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
      await fetchData();
    }

    setSaving(false);
  };

  const setStatus = async (id: string, status: 'draft' | 'finalized' | 'sent' | 'paid') => {
    const result = await updateInvoice(id, { status });
    if (result.errors && result.errors.length > 0) {
      setError('Failed to update invoice status.');
      return;
    }
    await fetchData();
  };

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.page}>
        <h1 className={styles.heading}>Invoices</h1>

        <form className={styles.infoPanel} onSubmit={handleCreate}>
          <h3>Generate Invoice</h3>
          <p className={styles.welcome}>Create invoice headers; line items can be appended in the next iteration.</p>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.name}</option>
            ))}
          </select>
          <input
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="Invoice number"
            required
          />
          <input
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
            type="number"
            min="0"
            step="0.01"
            placeholder="Total amount"
            required
          />
          <button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create Invoice'}</button>
        </form>

        {error && <div className={styles.infoPanel}><p>{error}</p></div>}

        <div className={styles.infoPanel}>
          <h3>Invoice List</h3>
          {loading ? (
            <p className={styles.welcome}>Loading invoices...</p>
          ) : invoices.length === 0 ? (
            <p className={styles.welcome}>No invoices yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.invoiceNumber}</td>
                    <td>{invoice.customerId.slice(0, 8)}</td>
                    <td>{invoice.totalAmount}</td>
                    <td>
                      <select
                        value={invoice.status ?? 'draft'}
                        onChange={(e) => {
                          void setStatus(invoice.id, e.target.value as 'draft' | 'finalized' | 'sent' | 'paid');
                        }}
                      >
                        <option value="draft">draft</option>
                        <option value="finalized">finalized</option>
                        <option value="sent">sent</option>
                        <option value="paid">paid</option>
                      </select>
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
