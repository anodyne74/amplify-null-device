'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import AdminActionButton from '@/app/components/AdminActionButton';
import AdminFeedbackBanner from '@/app/components/AdminFeedbackBanner';
import ConfirmDialog from '@/app/components/ConfirmDialog';
import OperatorRoute from '@/app/components/OperatorRoute';
import AdminDataTable from '@/app/components/AdminDataTable';
import AdminListState from '@/app/components/AdminListState';
import AdminSectionHeader from '@/app/components/AdminSectionHeader';
import type { ResolvedAddress } from '@/app/operator/components/AddressAutocompleteInput';
import CustomerCreateForm from '@/app/administrator/customers/components/CustomerCreateForm';
import CustomerEditPanel from '@/app/administrator/customers/components/CustomerEditPanel';
import CustomerOwnerPanel from '@/app/administrator/customers/components/CustomerOwnerPanel';
import CustomerTableRow from '@/app/administrator/customers/components/CustomerTableRow';
import { useCustomerEditState } from '@/app/administrator/customers/hooks/useCustomerEditState';
import { useCustomerOwnerState } from '@/app/administrator/customers/hooks/useCustomerOwnerState';
import type { Customer, CustomerUser } from '@/app/administrator/customers/types';
import { parseAgentOptionsInput, stringifyAgentOptions } from '@/lib/customerDefaults';
import { geocodeAddress } from '@/lib/googleMaps';
import {
  createCustomer,
  createCustomerUser,
  deleteCustomer,
  listCustomerUsers,
  listCustomers,
  syncViewerSubsForCustomer,
  updateCustomer,
} from '@/lib/queries';
import { useToast } from '@/app/components/ToastProvider';
import styles from '@/app/dashboard.module.css';

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
  const { showToast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Create customer form state
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [billingRatePerHour, setBillingRatePerHour] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [standingInstructions, setStandingInstructions] = useState('');
  const [defaultNumberOfSigns, setDefaultNumberOfSigns] = useState('');
  const [defaultAgentName, setDefaultAgentName] = useState('');
  const [defaultAgentInitials, setDefaultAgentInitials] = useState('');
  const [agentOptionsText, setAgentOptionsText] = useState('');
  const [createResolvedAddress, setCreateResolvedAddress] = useState<ResolvedAddress | null>(null);

  const {
    expandedEditPanel,
    editName,
    setEditName,
    editCompanyName,
    setEditCompanyName,
    editEmail,
    setEditEmail,
    editBillingRatePerHour,
    setEditBillingRatePerHour,
    editStatus,
    setEditStatus,
    editAddressLine1,
    setEditAddressLine1,
    editStandingInstructions,
    setEditStandingInstructions,
    editDefaultNumberOfSigns,
    setEditDefaultNumberOfSigns,
    editDefaultAgentName,
    setEditDefaultAgentName,
    editDefaultAgentInitials,
    setEditDefaultAgentInitials,
    editAgentOptionsText,
    setEditAgentOptionsText,
    editResolvedAddress,
    setEditResolvedAddress,
    editSaving,
    setEditSaving,
    editError,
    setEditError,
    editSuccess,
    setEditSuccess,
    closeEditPanel,
    openEditPanel,
  } = useCustomerEditState();

  const {
    expandedOwnerPanel,
    customerUsers,
    setCustomerUsers,
    ownerUserSub,
    ownerName,
    ownerEmail,
    ownerSaving,
    setOwnerSaving,
    ownerError,
    setOwnerError,
    ownerSuccess,
    setOwnerSuccess,
    resetOwnerSelection,
    closeOwnerPanel,
    openOwnerPanel,
    selectOwnerUserSub,
  } = useCustomerOwnerState();

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const allCustomers: Customer[] = [];
    let nextToken: string | undefined;

    do {
      const result = await listCustomers({ limit: 100, nextToken });
      if (result.errors && result.errors.length > 0) {
        setLoadError('Failed to load customers.');
        setCustomers([]);
        setLoading(false);
        return;
      }

      allCustomers.push(...((result.data as Customer[]) ?? []));
      nextToken = result.nextToken ?? undefined;
    } while (nextToken);

    setCustomers(allCustomers);
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
  }, [setCustomerUsers]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();

    const createRate = parseCurrency(billingRatePerHour);
    const createSigns = defaultNumberOfSigns.trim() ? Number(defaultNumberOfSigns) : undefined;
    if (Number.isNaN(createRate) || createRate < 0) {
      setError('Billing rate must be 0 or greater.');
      return;
    }

    if (defaultNumberOfSigns.trim() && (Number.isNaN(createSigns) || createSigns! < 0)) {
      setError('Default number of signs must be 0 or greater.');
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
        companyName: companyName.trim() || undefined,
        email,
        billingRatePerHour: createRate,
        status: 'active',
        addressLine1: resolved.formattedAddress,
        standingInstructions,
        defaultNumberOfSigns: createSigns,
        defaultAgentName,
        defaultAgentInitials,
        agentOptions: parseAgentOptionsInput(agentOptionsText),
      });

      if (result.errors && result.errors.length > 0) {
        setError('Failed to create customer.');
      } else {
        setName('');
        setCompanyName('');
        setEmail('');
        setBillingRatePerHour('');
        setAddressLine1('');
        setStandingInstructions('');
        setDefaultNumberOfSigns('');
        setDefaultAgentName('');
        setDefaultAgentInitials('');
        setAgentOptionsText('');
        setCreateResolvedAddress(null);
        await fetchCustomers();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Address could not be validated.');
    }

    setSaving(false);
  };

  const toggleOwnerPanel = async (customerId: string) => {
    closeEditPanel();
    if (expandedOwnerPanel === customerId) {
      closeOwnerPanel();
      return;
    }
    openOwnerPanel(customerId);
    await fetchCustomerUsers(customerId);
  };

  const toggleEditPanel = (customer: Customer) => {
    closeOwnerPanel();
    if (expandedEditPanel === customer.id) {
      closeEditPanel();
      return;
    }

    openEditPanel({
      customer,
      billingRateDisplay: usdFormatter.format(customer.billingRatePerHour ?? 0),
      agentOptionsText: stringifyAgentOptions(customer.agentOptions),
    });
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
    const editSigns = editDefaultNumberOfSigns.trim() ? Number(editDefaultNumberOfSigns) : undefined;
    if (Number.isNaN(rate) || rate < 0) {
      setEditError('Billing rate must be 0 or greater.');
      return;
    }

    if (editDefaultNumberOfSigns.trim() && (Number.isNaN(editSigns) || editSigns! < 0)) {
      setEditError('Default number of signs must be 0 or greater.');
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
        companyName: editCompanyName.trim() || undefined,
        email: editEmail.trim(),
        billingRatePerHour: rate,
        status: editStatus,
        addressLine1: resolved.formattedAddress,
        standingInstructions: editStandingInstructions,
        defaultNumberOfSigns: editSigns,
        defaultAgentName: editDefaultAgentName,
        defaultAgentInitials: editDefaultAgentInitials,
        agentOptions: parseAgentOptionsInput(editAgentOptionsText),
      });

      if (result.errors && result.errors.length > 0) {
        setEditError('Failed to update customer.');
      } else {
        const normalizedAgentOptions = parseAgentOptionsInput(editAgentOptionsText);
        setCustomers((prev) =>
          prev.map((customer) =>
            customer.id === customerId
              ? {
                  ...customer,
                  name: editName.trim(),
                  companyName: editCompanyName.trim() || null,
                  email: editEmail.trim(),
                  billingRatePerHour: rate,
                  status: editStatus,
                  addressLine1: resolved.formattedAddress,
                  standingInstructions: editStandingInstructions,
                  defaultNumberOfSigns: editSigns ?? null,
                  defaultAgentName: editDefaultAgentName,
                  defaultAgentInitials: editDefaultAgentInitials,
                  agentOptions: normalizedAgentOptions,
                }
              : customer
          )
        );
        setEditSuccess('Customer updated.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Address could not be validated.';
      setEditError(message);
    }

    setEditSaving(false);
  };

  const handleDeleteCustomer = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    const result = await deleteCustomer(deleteTarget.id);
    if (result.errors && result.errors.length > 0) {
      showToast(`Failed to delete customer ${deleteTarget.name}.`, 'error');
    } else {
      if (expandedEditPanel === deleteTarget.id) closeEditPanel();
      if (expandedOwnerPanel === deleteTarget.id) closeOwnerPanel();
      showToast(`Customer ${deleteTarget.name} deleted.`, 'success');
      await fetchCustomers();
    }

    setDeleting(false);
    setDeleteTarget(null);
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

      setCustomerUsers((prev) => ({
        ...prev,
        [customerId]: users,
      }));
      setOwnerSuccess('Account owner assigned and access synced.');
      resetOwnerSelection();
    }

    setOwnerSaving(false);
  };

  const existingOwner = (customerId: string) =>
    (customerUsers[customerId] ?? []).find((u) => u.role === 'account_owner');

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.page}>
        <h1 className={styles.heading}>Customers</h1>

        <ConfirmDialog
          open={deleteTarget !== null}
          title="Delete customer?"
          message={`Delete customer ${deleteTarget?.name ?? ''}? This permanently removes the customer record and cannot be undone.`}
          confirmLabel="Delete Customer"
          tone="danger"
          busy={deleting}
          onConfirm={() => {
            void handleDeleteCustomer();
          }}
          onCancel={() => {
            if (!deleting) setDeleteTarget(null);
          }}
        />

        <CustomerCreateForm
          showCreateForm={showCreateForm}
          saving={saving}
          name={name}
          companyName={companyName}
          email={email}
          billingRatePerHour={billingRatePerHour}
          defaultNumberOfSigns={defaultNumberOfSigns}
          defaultAgentName={defaultAgentName}
          defaultAgentInitials={defaultAgentInitials}
          addressLine1={addressLine1}
          agentOptionsText={agentOptionsText}
          standingInstructions={standingInstructions}
          onToggleShowCreateForm={() => setShowCreateForm(!showCreateForm)}
          onSubmit={handleCreate}
          onNameChange={setName}
          onCompanyNameChange={setCompanyName}
          onEmailChange={setEmail}
          onBillingRatePerHourChange={setBillingRatePerHour}
          onDefaultNumberOfSignsChange={setDefaultNumberOfSigns}
          onDefaultAgentNameChange={setDefaultAgentName}
          onDefaultAgentInitialsChange={setDefaultAgentInitials}
          onAddressChange={setAddressLine1}
          onAddressResolved={(resolved) => {
            setCreateResolvedAddress(resolved);
            if (resolved) {
              setAddressLine1(resolved.formattedAddress);
            }
          }}
          onAgentOptionsTextChange={setAgentOptionsText}
          onStandingInstructionsChange={setStandingInstructions}
        />

        <AdminFeedbackBanner
          message={error}
          tone="error"
          className={styles.infoPanel}
          messageClassName={styles.inlineErrorText}
        />

        <div className={styles.infoPanel}>
          <AdminSectionHeader title="Customer List" />
          {!loading && loadError ? (
            <>
              <AdminFeedbackBanner
                message={loadError}
                tone="error"
                messageClassName={styles.inlineErrorText}
              />
              <div className={styles.actionsRow}>
                <AdminActionButton
                  onClick={() => {
                    void fetchCustomers();
                  }}
                  variant="secondary"
                  aria-label="Retry loading customers"
                >
                  Retry
                </AdminActionButton>
              </div>
            </>
          ) : loading || customers.length === 0 ? (
            <AdminListState
              loading={loading}
              empty={!loading && customers.length === 0}
              loadingMessage="Loading customers..."
              emptyMessage="No customers yet."
            />
          ) : (
            <AdminDataTable
              hint="On smaller screens, swipe horizontally to see all customer columns."
              ariaLabel="Customer list"
            >
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Company Name</th>
                  <th scope="col">Correspondence Email</th>
                  <th scope="col">Rate/hr</th>
                  <th scope="col">Status</th>
                  <th scope="col">Manage</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <CustomerTableRow
                    key={customer.id}
                    customer={customer}
                    formattedRate={usdFormatter.format(customer.billingRatePerHour ?? 0)}
                    isEditOpen={expandedEditPanel === customer.id}
                    isOwnerOpen={expandedOwnerPanel === customer.id}
                    onToggleEdit={() => toggleEditPanel(customer)}
                    onToggleOwner={() => {
                      void toggleOwnerPanel(customer.id);
                    }}
                    onDelete={() => setDeleteTarget(customer)}
                    editPanel={(
                      <CustomerEditPanel
                        customer={customer}
                        editName={editName}
                        editCompanyName={editCompanyName}
                        editEmail={editEmail}
                        editBillingRatePerHour={editBillingRatePerHour}
                        editStatus={editStatus}
                        editAddressLine1={editAddressLine1}
                        editStandingInstructions={editStandingInstructions}
                        editDefaultNumberOfSigns={editDefaultNumberOfSigns}
                        editDefaultAgentName={editDefaultAgentName}
                        editDefaultAgentInitials={editDefaultAgentInitials}
                        editAgentOptionsText={editAgentOptionsText}
                        editSaving={editSaving}
                        editError={editError}
                        editSuccess={editSuccess}
                        onEditNameChange={setEditName}
                        onEditCompanyNameChange={setEditCompanyName}
                        onEditEmailChange={setEditEmail}
                        onEditBillingRatePerHourChange={setEditBillingRatePerHour}
                        onEditBillingRatePerHourBlur={(value) => setEditBillingRatePerHour(formatCurrency(value))}
                        onEditStatusChange={setEditStatus}
                        onEditDefaultNumberOfSignsChange={setEditDefaultNumberOfSigns}
                        onEditDefaultAgentNameChange={setEditDefaultAgentName}
                        onEditDefaultAgentInitialsChange={setEditDefaultAgentInitials}
                        onEditAddressLine1Change={setEditAddressLine1}
                        onEditResolvedAddressChange={(resolved) => {
                          setEditResolvedAddress(resolved);
                          if (resolved) {
                            setEditAddressLine1(resolved.formattedAddress);
                          }
                        }}
                        onEditAgentOptionsTextChange={setEditAgentOptionsText}
                        onEditStandingInstructionsChange={setEditStandingInstructions}
                        onSave={() => {
                          void handleUpdateCustomer(customer.id);
                        }}
                        onCancel={() => toggleEditPanel(customer)}
                      />
                    )}
                    ownerPanel={(
                      <CustomerOwnerPanel
                        customer={customer}
                        ownerError={ownerError}
                        ownerSuccess={ownerSuccess}
                        ownerSaving={ownerSaving}
                        ownerUserSub={ownerUserSub}
                        ownerName={ownerName}
                        ownerEmail={ownerEmail}
                        usersForCustomer={customerUsers[customer.id] ?? []}
                        existingOwner={existingOwner(customer.id)}
                        onOwnerUserSubChange={(selectedUserSub) => {
                          selectOwnerUserSub(selectedUserSub, customerUsers[customer.id] ?? []);
                        }}
                        onAssignOwner={() => {
                          void handleAssignOwner(customer.id);
                        }}
                      />
                    )}
                  />
                ))}
              </tbody>
            </AdminDataTable>
          )}
        </div>
      </div>
    </OperatorRoute>
  );
}
