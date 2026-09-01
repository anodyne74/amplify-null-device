'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import ConfirmDialog from '@/app/components/ConfirmDialog';
import OperatorRoute from '@/app/components/OperatorRoute';
import { useAdminTableSort, type SortDirection } from '@/app/components/AdminDataTable';
import { ADMIN_PAGE_SIZE, getPageSlice } from '@/app/components/AdminPagination';
import type { ResolvedAddress } from '@/app/operator/components/AddressAutocompleteInput';
import PageHeader from '@/app/administrator/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import CustomerCreateForm from '@/app/administrator/customers/components/CustomerCreateForm';
import CustomerEditPanel from '@/app/administrator/customers/components/CustomerEditPanel';
import CustomerTableRow from '@/app/administrator/customers/components/CustomerTableRow';
import { useCustomerEditState } from '@/app/administrator/customers/hooks/useCustomerEditState';
import type { Customer, CustomerUser } from '@/app/administrator/customers/types';
import { addAgentOption as addAgentOptionTo, removeAgentOption as removeAgentOptionFrom } from '@/lib/customerDefaults';
import { geocodeAddress } from '@/lib/googleMaps';
import {
  createCustomer,
  deleteCustomer,
  listCustomerInvoices,
  listCustomerRoutes,
  listCustomerUsers,
  listCustomers,
  updateCustomer,
} from '@/lib/queries';
import { buildOnboardingChecklist, type ChecklistItem } from '@/lib/customerOnboardingChecklist';
import { useToast } from '@/app/components/ToastProvider';
import styles from './page.module.css';

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

function SortableHeader<K extends string>({
  label,
  sortKey,
  sortBy,
  sortDirection,
  onSort,
}: {
  label: string;
  sortKey: K;
  sortBy: K | null;
  sortDirection: SortDirection;
  onSort: (key: K) => void;
}) {
  const active = sortBy === sortKey;
  const ariaSort = active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none';

  return (
    <th scope="col" aria-sort={ariaSort}>
      <button type="button" className={styles.sortButton} onClick={() => onSort(sortKey)} aria-label={`Sort by ${label}`}>
        <span>{label}</span>
        <span className={styles.sortIndicator} aria-hidden="true">
          {active ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

export default function CustomersAdminPage() {
  const { showToast } = useToast();
  const { user } = useAuthenticator();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [checklists, setChecklists] = useState<Record<string, ChecklistItem[]>>({});
  const [checklistLoading, setChecklistLoading] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Sorting + pagination for the customer list
  const { sortBy, sortDirection, toggleSort } = useAdminTableSort<'name' | 'status'>();
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [sortBy, sortDirection]);

  const sortedCustomers = useMemo(() => {
    if (!sortBy) return customers;
    const value = (customer: Customer) =>
      sortBy === 'name' ? customer.name ?? '' : customer.status ?? 'active';
    const sorted = [...customers].sort((a, b) =>
      value(a).localeCompare(value(b), undefined, { numeric: true, sensitivity: 'base' })
    );
    if (sortDirection === 'desc') sorted.reverse();
    return sorted;
  }, [customers, sortBy, sortDirection]);

  const { currentPage, totalPages, pageRows: pageCustomers } = getPageSlice(sortedCustomers, page, ADMIN_PAGE_SIZE);

  // Create customer form state
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [billingRatePerHour, setBillingRatePerHour] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [standingInstructions, setStandingInstructions] = useState('');
  const [defaultNumberOfSigns, setDefaultNumberOfSigns] = useState('');
  const [defaultAgentInitials, setDefaultAgentInitials] = useState('');
  const [agentOptions, setAgentOptions] = useState<string[]>([]);
  const [createResolvedAddress, setCreateResolvedAddress] = useState<ResolvedAddress | null>(null);

  const addAgentOptionToCreate = useCallback((value: string) => {
    setAgentOptions((prev) => addAgentOptionTo(prev, value));
  }, []);

  const removeAgentOptionFromCreate = useCallback((value: string) => {
    setAgentOptions((prev) => removeAgentOptionFrom(prev, value));
  }, []);

  const {
    expandedEditPanel,
    editName,
    setEditName,
    editCompanyName,
    setEditCompanyName,
    editEmail,
    setEditEmail,
    editContactPhone,
    setEditContactPhone,
    editBillingRatePerHour,
    setEditBillingRatePerHour,
    editStatus,
    setEditStatus,
    editAddressLine1,
    setEditAddressLine1,
    editOriginalAddressLine1,
    editStandingInstructions,
    setEditStandingInstructions,
    editOriginalStandingInstructions,
    editDefaultNumberOfSigns,
    setEditDefaultNumberOfSigns,
    editDefaultAgentInitials,
    setEditDefaultAgentInitials,
    editAgentOptions,
    addAgentOption,
    removeAgentOption,
    editRestrictInvitesToOwnDomain,
    setEditRestrictInvitesToOwnDomain,
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

  // "Onboarding checklist" — computed client-side from records already scoped to this
  // customer, fetched on demand when the edit panel opens. No new model, no new writes.
  const fetchOnboardingChecklist = useCallback(async (customer: Customer) => {
    setChecklistLoading((prev) => ({ ...prev, [customer.id]: true }));

    const [usersResult, routesResult, invoicesResult] = await Promise.all([
      listCustomerUsers(customer.id),
      listCustomerRoutes(customer.id, { limit: 5 }),
      listCustomerInvoices(customer.id, { limit: 5 }),
    ]);

    const users = (usersResult.errors && usersResult.errors.length > 0 ? [] : usersResult.data) as CustomerUser[];

    setChecklists((prev) => ({
      ...prev,
      [customer.id]: buildOnboardingChecklist(customer, users, routesResult.data ?? [], invoicesResult.data ?? []),
    }));
    setChecklistLoading((prev) => ({ ...prev, [customer.id]: false }));
  }, []);

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
        defaultAgentInitials,
        agentOptions,
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
        setDefaultAgentInitials('');
        setAgentOptions([]);
        setCreateResolvedAddress(null);
        await fetchCustomers();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Address could not be validated.');
    }

    setSaving(false);
  };

  const toggleEditPanel = (customer: Customer) => {
    if (expandedEditPanel === customer.id) {
      closeEditPanel();
      return;
    }

    openEditPanel({
      customer,
      billingRateDisplay: usdFormatter.format(customer.billingRatePerHour ?? 0),
      agentOptions: customer.agentOptions ?? [],
    });
    void fetchOnboardingChecklist(customer);
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

      const trimmedAddress = editAddressLine1.trim();
      const addressUnchanged = trimmedAddress === editOriginalAddressLine1.trim();
      const resolved =
        editResolvedAddress ??
        (addressUnchanged
          ? { formattedAddress: trimmedAddress, latitude: 0, longitude: 0 }
          : await geocodeAddress(trimmedAddress));

      // Stamp "last edited by/when" only when the standing instructions text actually changed.
      const standingInstructionsChanged =
        editStandingInstructions.trim() !== editOriginalStandingInstructions.trim();
      const standingInstructionsStamp = standingInstructionsChanged
        ? {
            standingInstructionsUpdatedBy: user?.signInDetails?.loginId || 'unknown',
            standingInstructionsUpdatedAt: new Date().toISOString(),
          }
        : {};

      const result = await updateCustomer(customerId, {
        name: editName.trim(),
        companyName: editCompanyName.trim() || undefined,
        email: editEmail.trim(),
        contactPhone: editContactPhone.trim() || undefined,
        billingRatePerHour: rate,
        status: editStatus,
        addressLine1: resolved.formattedAddress,
        standingInstructions: editStandingInstructions,
        defaultNumberOfSigns: editSigns,
        defaultAgentInitials: editDefaultAgentInitials,
        agentOptions: editAgentOptions,
        restrictInvitesToOwnDomain: editRestrictInvitesToOwnDomain,
        ...standingInstructionsStamp,
      });

      if (result.errors && result.errors.length > 0) {
        setEditError('Failed to update customer.');
      } else {
        setCustomers((prev) =>
          prev.map((customer) =>
            customer.id === customerId
              ? {
                  ...customer,
                  name: editName.trim(),
                  companyName: editCompanyName.trim() || null,
                  email: editEmail.trim(),
                  contactPhone: editContactPhone.trim() || null,
                  billingRatePerHour: rate,
                  status: editStatus,
                  addressLine1: resolved.formattedAddress,
                  standingInstructions: editStandingInstructions,
                  defaultNumberOfSigns: editSigns ?? null,
                  defaultAgentInitials: editDefaultAgentInitials,
                  agentOptions: editAgentOptions,
                  restrictInvitesToOwnDomain: editRestrictInvitesToOwnDomain,
                  ...standingInstructionsStamp,
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
      showToast(`Customer ${deleteTarget.name} deleted.`, 'success');
      await fetchCustomers();
    }

    setDeleting(false);
    setDeleteTarget(null);
  };

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.page}>
        <PageHeader title="Customers" />

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
          defaultAgentInitials={defaultAgentInitials}
          addressLine1={addressLine1}
          agentOptions={agentOptions}
          standingInstructions={standingInstructions}
          onToggleShowCreateForm={() => setShowCreateForm(!showCreateForm)}
          onSubmit={handleCreate}
          onNameChange={setName}
          onCompanyNameChange={setCompanyName}
          onEmailChange={setEmail}
          onBillingRatePerHourChange={setBillingRatePerHour}
          onDefaultNumberOfSignsChange={setDefaultNumberOfSigns}
          onDefaultAgentInitialsChange={setDefaultAgentInitials}
          onAddressChange={setAddressLine1}
          onAddressResolved={(resolved) => {
            setCreateResolvedAddress(resolved);
            if (resolved) {
              setAddressLine1(resolved.formattedAddress);
            }
          }}
          onAddAgentOption={addAgentOptionToCreate}
          onRemoveAgentOption={removeAgentOptionFromCreate}
          onStandingInstructionsChange={setStandingInstructions}
        />

        {error && <div className={styles.errorBanner} role="alert" aria-live="assertive">{error}</div>}

        <Card title="Customer List" padded={!loading && !loadError && customers.length > 0 ? false : true}>
          {!loading && loadError ? (
            <>
              <div className={styles.errorBanner} role="alert" aria-live="assertive">{loadError}</div>
              <div className={`${styles.actionsRow} ${styles.retryRow}`}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void fetchCustomers();
                  }}
                  aria-label="Retry loading customers"
                >
                  Retry
                </Button>
              </div>
            </>
          ) : loading || customers.length === 0 ? (
            <p className={styles.mutedText}>{loading ? 'Loading customers...' : 'No customers yet.'}</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className="nd-table nd-table--hoverable" aria-label="Customer list">
                <thead>
                  <tr>
                    <SortableHeader label="Name" sortKey="name" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} />
                    <th scope="col">Company Name</th>
                    <th scope="col">Correspondence Email</th>
                    <SortableHeader label="Status" sortKey="status" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} />
                    <th scope="col">Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {pageCustomers.map((customer) => (
                    <CustomerTableRow
                      key={customer.id}
                      customer={customer}
                      isEditOpen={expandedEditPanel === customer.id}
                      onToggleEdit={() => toggleEditPanel(customer)}
                      onDelete={() => setDeleteTarget(customer)}
                      editPanel={(
                        <CustomerEditPanel
                          customer={customer}
                          editName={editName}
                          editCompanyName={editCompanyName}
                          editEmail={editEmail}
                          editContactPhone={editContactPhone}
                          editBillingRatePerHour={editBillingRatePerHour}
                          editStatus={editStatus}
                          editAddressLine1={editAddressLine1}
                          editStandingInstructions={editStandingInstructions}
                          editDefaultNumberOfSigns={editDefaultNumberOfSigns}
                          editDefaultAgentInitials={editDefaultAgentInitials}
                          editAgentOptions={editAgentOptions}
                          editRestrictInvitesToOwnDomain={editRestrictInvitesToOwnDomain}
                          editSaving={editSaving}
                          editError={editError}
                          editSuccess={editSuccess}
                          checklist={checklists[customer.id]}
                          checklistLoading={checklistLoading[customer.id]}
                          onEditNameChange={setEditName}
                          onEditCompanyNameChange={setEditCompanyName}
                          onEditEmailChange={setEditEmail}
                          onEditContactPhoneChange={setEditContactPhone}
                          onEditBillingRatePerHourChange={setEditBillingRatePerHour}
                          onEditBillingRatePerHourBlur={(value) => setEditBillingRatePerHour(formatCurrency(value))}
                          onEditStatusChange={setEditStatus}
                          onEditDefaultNumberOfSignsChange={setEditDefaultNumberOfSigns}
                          onEditDefaultAgentInitialsChange={setEditDefaultAgentInitials}
                          onEditAddressLine1Change={setEditAddressLine1}
                          onEditResolvedAddressChange={(resolved) => {
                            setEditResolvedAddress(resolved);
                            if (resolved) {
                              setEditAddressLine1(resolved.formattedAddress);
                            }
                          }}
                          onAddAgentOption={addAgentOption}
                          onRemoveAgentOption={removeAgentOption}
                          onEditStandingInstructionsChange={setEditStandingInstructions}
                          onEditRestrictInvitesToOwnDomainChange={setEditRestrictInvitesToOwnDomain}
                          onSave={() => {
                            void handleUpdateCustomer(customer.id);
                          }}
                          onCancel={() => toggleEditPanel(customer)}
                        />
                      )}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && !loadError && customers.length > 0 && (
            <nav className={styles.paginationBar} aria-label="customers pagination">
              <p className={styles.paginationSummary} aria-live="polite">
                {`Showing ${(currentPage - 1) * ADMIN_PAGE_SIZE + 1}–${Math.min(sortedCustomers.length, currentPage * ADMIN_PAGE_SIZE)} of ${sortedCustomers.length} customers`}
              </p>
              <div className={styles.paginationControls}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                  aria-label="Previous page of customers"
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                  aria-label="Next page of customers"
                >
                  Next
                </Button>
              </div>
            </nav>
          )}
        </Card>
      </div>
    </OperatorRoute>
  );
}
