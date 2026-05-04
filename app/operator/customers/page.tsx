'use client';

import { Fragment, FormEvent, useCallback, useEffect, useState } from 'react';
import OperatorRoute from '@/app/components/OperatorRoute';
import {
  createCustomer,
  createCustomerUser,
  listCustomerUsers,
  listCustomers,
  syncViewerSubsForCustomer,
  updateCustomer,
} from '@/lib/queries';
import styles from '@/app/dashboard.module.css';

type Customer = {
  id: string;
  name: string;
  email: string;
  billingRatePerHour: number;
  status?: 'active' | 'inactive' | 'suspended' | null;
};

type CustomerUser = {
  id: string;
  customerId: string;
  userSub: string;
  accountOwnerSub: string;
  name?: string | null;
  email?: string | null;
  role?: 'account_owner' | 'read_only' | null;
};

export default function CustomersAdminPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create customer form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [billingRatePerHour, setBillingRatePerHour] = useState('0');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postcode, setPostcode] = useState('');
  const [country, setCountry] = useState('');

  // Owner assignment panel state (keyed by customerId)
  const [expandedOwnerPanel, setExpandedOwnerPanel] = useState<string | null>(null);
  const [customerUsers, setCustomerUsers] = useState<Record<string, CustomerUser[]>>({});
  const [ownerUserSub, setOwnerUserSub] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerSaving, setOwnerSaving] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [ownerSuccess, setOwnerSuccess] = useState<string | null>(null);

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

  const fetchCustomerUsers = useCallback(async (customerId: string) => {
    const result = await listCustomerUsers(customerId);
    if (!result.errors || result.errors.length === 0) {
      setCustomerUsers((prev) => ({ ...prev, [customerId]: result.data as CustomerUser[] }));
    }
  }, []);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const result = await createCustomer({
      name,
      email,
      billingRatePerHour: Number(billingRatePerHour),
      status: 'active',
      addressLine1: addressLine1 || undefined,
      addressLine2: addressLine2 || undefined,
      city: city || undefined,
      state: state || undefined,
      postcode: postcode || undefined,
      country: country || undefined,
    });

    if (result.errors && result.errors.length > 0) {
      setError('Failed to create customer.');
    } else {
      setName('');
      setEmail('');
      setBillingRatePerHour('0');
      setAddressLine1('');
      setAddressLine2('');
      setCity('');
      setState('');
      setPostcode('');
      setCountry('');
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

  const toggleOwnerPanel = async (customerId: string) => {
    if (expandedOwnerPanel === customerId) {
      setExpandedOwnerPanel(null);
      return;
    }
    setExpandedOwnerPanel(customerId);
    setOwnerError(null);
    setOwnerSuccess(null);
    setOwnerUserSub('');
    setOwnerName('');
    setOwnerEmail('');
    await fetchCustomerUsers(customerId);
  };

  const handleAssignOwner = async (customerId: string) => {
    if (!ownerUserSub.trim()) {
      setOwnerError('Cognito user sub is required.');
      return;
    }
    setOwnerSaving(true);
    setOwnerError(null);
    setOwnerSuccess(null);

    const result = await createCustomerUser({
      customerId,
      userSub: ownerUserSub.trim(),
      accountOwnerSub: ownerUserSub.trim(), // account owner's sub is their own sub
      role: 'account_owner',
      name: ownerName || undefined,
      email: ownerEmail || undefined,
    });

    if (result.errors && result.errors.length > 0) {
      setOwnerError('Failed to assign account owner.');
    } else {
      // Sync viewerSubs on all routes/stops for this customer
      const users = [...(customerUsers[customerId] ?? [])];
      if (result.data) users.push(result.data as CustomerUser);
      const viewerSubs = [...new Set(users.map((u) => u.userSub))];
      await syncViewerSubsForCustomer(customerId, viewerSubs);

      setOwnerSuccess('Account owner assigned and access synced.');
      setOwnerUserSub('');
      setOwnerName('');
      setOwnerEmail('');
      await fetchCustomerUsers(customerId);
    }

    setOwnerSaving(false);
  };

  const existingOwner = (customerId: string) =>
    (customerUsers[customerId] ?? []).find((u) => u.role === 'account_owner');

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
          <input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} placeholder="Address line 1" />
          <input value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} placeholder="Address line 2" />
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
          <input value={state} onChange={(e) => setState(e.target.value)} placeholder="State / Province" />
          <input value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="Postcode / ZIP" />
          <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" />
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
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <Fragment key={customer.id}>
                    <tr>
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
                      <td>
                        <button
                          type="button"
                          onClick={() => void toggleOwnerPanel(customer.id)}
                        >
                          {expandedOwnerPanel === customer.id ? 'Close' : 'Manage Owner'}
                        </button>
                      </td>
                    </tr>
                    {expandedOwnerPanel === customer.id && (
                      <tr key={`${customer.id}-owner-panel`}>
                        <td colSpan={5}>
                          <div className={styles.infoPanel}>
                            <h4>Account Owner — {customer.name}</h4>
                            {ownerError && <p>{ownerError}</p>}
                            {ownerSuccess && <p>{ownerSuccess}</p>}

                            {existingOwner(customer.id) ? (
                              <div>
                                <p>
                                  <strong>Owner assigned:</strong>{' '}
                                  {existingOwner(customer.id)?.name ?? '—'}{' '}
                                  ({existingOwner(customer.id)?.email ?? existingOwner(customer.id)?.userSub})
                                </p>
                                <p className={styles.welcome}>
                                  To change the account owner, remove the existing CustomerUser record
                                  from the Users admin page, then assign a new one here.
                                </p>
                              </div>
                            ) : (
                              <div>
                                <p className={styles.welcome}>
                                  Assign a Cognito user as the account owner. The owner can view invoices
                                  and the customer user list. Enter their Cognito user sub (UUID).
                                </p>
                                <input
                                  value={ownerUserSub}
                                  onChange={(e) => setOwnerUserSub(e.target.value)}
                                  placeholder="Cognito user sub (UUID)"
                                  disabled={ownerSaving}
                                />
                                <input
                                  value={ownerName}
                                  onChange={(e) => setOwnerName(e.target.value)}
                                  placeholder="Display name (optional)"
                                  disabled={ownerSaving}
                                />
                                <input
                                  value={ownerEmail}
                                  onChange={(e) => setOwnerEmail(e.target.value)}
                                  placeholder="Email (optional)"
                                  type="email"
                                  disabled={ownerSaving}
                                />
                                <button
                                  type="button"
                                  onClick={() => void handleAssignOwner(customer.id)}
                                  disabled={ownerSaving || !ownerUserSub.trim()}
                                >
                                  {ownerSaving ? 'Assigning...' : 'Assign as Account Owner'}
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </OperatorRoute>
  );
}
