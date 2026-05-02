'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import OperatorRoute from '@/app/components/OperatorRoute';
import { createCustomer, listCustomers, updateCustomer } from '@/lib/queries';
import styles from '@/app/dashboard.module.css';

type Customer = {
  id: string;
  name: string;
  email: string;
  billingRatePerHour: number;
  status?: 'active' | 'inactive' | 'suspended' | null;
};

export default function CustomersAdminPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [billingRatePerHour, setBillingRatePerHour] = useState('0');

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listCustomers({ limit: 100 });
    if (result.errors && result.errors.length > 0) {
      setError('Failed to load customers.');
    } else {
      setCustomers((result.data as Customer[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const result = await createCustomer({
      name,
      email,
      billingRatePerHour: Number(billingRatePerHour),
      status: 'active',
    });

    if (result.errors && result.errors.length > 0) {
      setError('Failed to create customer.');
    } else {
      setName('');
      setEmail('');
      setBillingRatePerHour('0');
      await fetchCustomers();
    }

    setSaving(false);
  };

  const setStatus = async (id: string, status: 'active' | 'inactive' | 'suspended') => {
    const result = await updateCustomer(id, { status });
    if (result.errors && result.errors.length > 0) {
      setError('Failed to update customer status.');
      return;
    }
    await fetchCustomers();
  };

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.page}>
        <h1 className={styles.heading}>Customers</h1>

        <form className={styles.infoPanel} onSubmit={handleCreate}>
          <h3>Define Customer</h3>
          <p className={styles.welcome}>Create a new customer record for route and billing workflows.</p>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" required />
          <input
            value={billingRatePerHour}
            onChange={(e) => setBillingRatePerHour(e.target.value)}
            placeholder="Billing rate per hour"
            type="number"
            min="0"
            step="0.01"
            required
          />
          <button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create Customer'}</button>
        </form>

        {error && <div className={styles.infoPanel}><p>{error}</p></div>}

        <div className={styles.infoPanel}>
          <h3>Customer List</h3>
          {loading ? (
            <p className={styles.welcome}>Loading customers...</p>
          ) : customers.length === 0 ? (
            <p className={styles.welcome}>No customers yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Rate/hr</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>{customer.name}</td>
                    <td>{customer.email}</td>
                    <td>{customer.billingRatePerHour}</td>
                    <td>
                      <select
                        value={customer.status ?? 'active'}
                        onChange={(e) => {
                          void setStatus(customer.id, e.target.value as 'active' | 'inactive' | 'suspended');
                        }}
                      >
                        <option value="active">active</option>
                        <option value="inactive">inactive</option>
                        <option value="suspended">suspended</option>
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
