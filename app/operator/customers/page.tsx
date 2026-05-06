'use client';

import { Fragment, FormEvent, useCallback, useEffect, useState } from 'react';
import OperatorRoute from '@/app/components/OperatorRoute';
import { AddressAutocompleteInput, type ResolvedAddress } from '@/app/operator/components/AddressAutocompleteInput';
import { geocodeAddress } from '@/lib/googleMaps';
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
  addressLine1?: string | null;
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

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function parseCurrency(value: string): number {
  const normalized = value.replace(/[^0-9.-]/g, '');
  if (!normalized) return Number.NaN;
  return Number(normalized);
}

function formatCurrency(value: string): string {
  const parsed = parseCurrency(value);
  if (Number.isNaN(parsed)) return value;
  return usdFormatter.format(parsed);
}

export default function CustomersAdminPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create customer form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [billingRatePerHour, setBillingRatePerHour] = useState('$0.00');
  const [addressLine1, setAddressLine1] = useState('');
  const [createResolvedAddress, setCreateResolvedAddress] = useState<ResolvedAddress | null>(null);

  // Edit customer panel state
  const [expandedEditPanel, setExpandedEditPanel] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editBillingRatePerHour, setEditBillingRatePerHour] = useState('$0.00');
  const [editStatus, setEditStatus] = useState<'active' | 'inactive' | 'suspended'>('active');
  const [editAddressLine1, setEditAddressLine1] = useState('');
  const [editResolvedAddress, setEditResolvedAddress] = useState<ResolvedAddress | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

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

    const createRate = parseCurrency(billingRatePerHour);
    if (Number.isNaN(createRate) || createRate < 0) {
      setError('Billing rate must be 0 or greater.');
      return;
    }

    if (!addressLine1.trim()) {
      setError('Address is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const resolved = createResolvedAddress ?? (await geocodeAddress(addressLine1.trim()));

      const result = await createCustomer({
        name,
        email,
        billingRatePerHour: createRate,
        status: 'active',
        addressLine1: resolved.formattedAddress,
      });

      if (result.errors && result.errors.length > 0) {
        setError('Failed to create customer.');
      } else {
        setName('');
        setEmail('');
        setBillingRatePerHour('$0.00');
        setAddressLine1('');
        setCreateResolvedAddress(null);
        await fetchCustomers();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Address could not be validated.');
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
    setExpandedEditPanel(null);
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

  const toggleEditPanel = (customer: Customer) => {
    setExpandedOwnerPanel(null);
    if (expandedEditPanel === customer.id) {
      setExpandedEditPanel(null);
      setEditError(null);
      setEditSuccess(null);
      setEditResolvedAddress(null);
      return;
    }

    setExpandedEditPanel(customer.id);
    setEditError(null);
    setEditSuccess(null);
    setEditResolvedAddress(null);

    setEditName(customer.name);
    setEditEmail(customer.email);
    setEditBillingRatePerHour(usdFormatter.format(customer.billingRatePerHour ?? 0));
    setEditStatus(customer.status ?? 'active');
    setEditAddressLine1(customer.addressLine1 ?? '');
  };

  const handleUpdateCustomer = async (customerId: string) => {
    if (!editName.trim()) {
      setEditError('Name is required.');
      return;
    }
    if (!editEmail.trim()) {
      setEditError('Email is required.');
      return;
    }

    const rate = parseCurrency(editBillingRatePerHour);
    if (Number.isNaN(rate) || rate < 0) {
      setEditError('Billing rate must be 0 or greater.');
      return;
    }

    setEditSaving(true);
    setEditError(null);
    setEditSuccess(null);

    try {
      if (!editAddressLine1.trim()) {
        setEditError('Address is required.');
        setEditSaving(false);
        return;
      }

      const resolved = editResolvedAddress ?? (await geocodeAddress(editAddressLine1.trim()));

      const result = await updateCustomer(customerId, {
        name: editName.trim(),
        email: editEmail.trim(),
        billingRatePerHour: rate,
        status: editStatus,
        addressLine1: resolved.formattedAddress,
      });

      if (result.errors && result.errors.length > 0) {
        setEditError('Failed to update customer.');
      } else {
        setEditSuccess('Customer updated.');
        await fetchCustomers();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Address could not be validated.';
      setEditError(message);
    }

    setEditSaving(false);
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
            onBlur={(e) => setBillingRatePerHour(formatCurrency(e.target.value))}
            placeholder="Billing rate per hour"
            type="text"
            inputMode="decimal"
            required
          />
          <AddressAutocompleteInput
            id="create-customer-address"
            value={addressLine1}
            onChange={(value) => {
              setAddressLine1(value);
            }}
            onResolved={(resolved) => {
              setCreateResolvedAddress(resolved);
              if (resolved) {
                setAddressLine1(resolved.formattedAddress);
              }
            }}
            disabled={saving}
            placeholder="Address"
            className={styles.input}
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
                  <th>Manage</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <Fragment key={customer.id}>
                    <tr>
                      <td>{customer.name}</td>
                      <td>{customer.email}</td>
                      <td>{usdFormatter.format(customer.billingRatePerHour ?? 0)}</td>
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
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={() => toggleEditPanel(customer)}
                          >
                            {expandedEditPanel === customer.id ? 'Close Edit' : 'Edit'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleOwnerPanel(customer.id)}
                          >
                            {expandedOwnerPanel === customer.id ? 'Close Owner' : 'Manage Owner'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedEditPanel === customer.id && (
                      <tr key={`${customer.id}-edit-panel`}>
                        <td colSpan={5}>
                          <div className={styles.infoPanel}>
                            <h4>Edit Customer — {customer.name}</h4>
                            {editError && <p>{editError}</p>}
                            {editSuccess && <p>{editSuccess}</p>}
                            <p className={styles.welcome}>
                              Address is validated via Google address lookup before saving.
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                              <input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                placeholder="Name"
                                disabled={editSaving}
                                required
                              />
                              <input
                                value={editEmail}
                                onChange={(e) => setEditEmail(e.target.value)}
                                placeholder="Email"
                                type="email"
                                disabled={editSaving}
                                required
                              />
                              <input
                                value={editBillingRatePerHour}
                                onChange={(e) => setEditBillingRatePerHour(e.target.value)}
                                onBlur={(e) => setEditBillingRatePerHour(formatCurrency(e.target.value))}
                                placeholder="Billing rate per hour"
                                type="text"
                                inputMode="decimal"
                                disabled={editSaving}
                                required
                              />
                              <select
                                value={editStatus}
                                onChange={(e) => setEditStatus(e.target.value as 'active' | 'inactive' | 'suspended')}
                                disabled={editSaving}
                              >
                                <option value="active">active</option>
                                <option value="inactive">inactive</option>
                                <option value="suspended">suspended</option>
                              </select>
                              <div style={{ gridColumn: '1 / -1' }}>
                                <AddressAutocompleteInput
                                  id={`customer-address-${customer.id}`}
                                  value={editAddressLine1}
                                  onChange={(value) => {
                                    setEditAddressLine1(value);
                                  }}
                                  onResolved={(resolved) => {
                                    setEditResolvedAddress(resolved);
                                    if (resolved) {
                                      setEditAddressLine1(resolved.formattedAddress);
                                    }
                                  }}
                                  disabled={editSaving}
                                  placeholder="Address"
                                  className={styles.input}
                                />
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                              <button
                                type="button"
                                onClick={() => void handleUpdateCustomer(customer.id)}
                                disabled={editSaving}
                              >
                                {editSaving ? 'Saving...' : 'Save Customer'}
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleEditPanel(customer)}
                                disabled={editSaving}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
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
