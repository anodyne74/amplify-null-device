'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import ConfirmDialog from '@/app/components/ConfirmDialog';
import OperatorRoute from '@/app/components/OperatorRoute';
import PageHeader from '@/app/administrator/components/PageHeader';
import { useAdminTableSort, type SortDirection } from '@/app/components/AdminDataTable';
import { ADMIN_PAGE_SIZE, getPageSlice } from '@/app/components/AdminPagination';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Select } from '@/app/components/ui/forms/Select';
import { Radio } from '@/app/components/ui/forms/Radio';
import { Badge } from '@/app/components/ui/core/Badge';
import { StatTile } from '@/app/components/ui/data/StatTile';
import { Dialog } from '@/app/components/ui/feedback/Dialog';
import {
  createCustomerUser,
  deleteCustomerUser,
  updateCustomerUser,
  listAllCustomerUsers,
  listCustomers,
  syncViewerSubsForCustomer,
} from '@/lib/queries';
import CustomerUserTableRow, {
  type CustomerUserRowData,
} from '@/app/administrator/users/components/CustomerUserTableRow';
import styles from './page.module.css';

type CognitoUser = {
  id?: string;
  username?: string;
  sub?: string;
  enabled?: boolean;
  status?: string;
  name?: string;
  firstName?: string;
  email?: string;
  createdAt?: string;
  updatedAt?: string;
};

type CustomerSummary = {
  id: string;
  name: string;
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

// Older CustomerUser records may still carry this placeholder prefix from
// before user creation was synchronous (see handleAddCustomerUser) -- kept
// only so toViewerSubs continues to filter any such legacy rows out.
const PENDING_SUB_PREFIX = 'pending:';

function toViewerSubs(users: Array<{ userSub?: string | null }>) {
  return [
    ...new Set(
      users
        .map((user) => (user.userSub || '').trim())
        .filter((userSub): userSub is string => Boolean(userSub) && !userSub.startsWith(PENDING_SUB_PREFIX))
    ),
  ];
}

type CustomerUserSortKey = 'name' | 'customer' | 'role' | 'status';

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

export default function UsersAdminPage() {
  // Customer Access section state
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [allCustomerUsers, setAllCustomerUsers] = useState<CustomerUser[]>([]);
  const [customerUsersLoading, setCustomerUsersLoading] = useState(true);
  const [tableLoadError, setTableLoadError] = useState<string | null>(null);
  // Cognito status/last-modified for every user in the `customer` group -- joined
  // onto allCustomerUsers by sub for the Status/Last seen columns below.
  const [customerGroupCognitoUsers, setCustomerGroupCognitoUsers] = useState<CognitoUser[]>([]);
  const [activityStats, setActivityStats] = useState<{
    pendingInvites: number;
    signedInLast7Days: number;
    signedInStatsAvailable: boolean;
  } | null>(null);
  const [accessPending, setAccessPending] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessSuccess, setAccessSuccess] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'account_owner' | 'read_only'>('read_only');
  const [newUserName, setNewUserName] = useState('');
  const [removalTarget, setRemovalTarget] = useState<CustomerUser | null>(null);
  const [editTarget, setEditTarget] = useState<CustomerUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<'account_owner' | 'read_only'>('read_only');

  const callAdminApi = useCallback(async (body: Record<string, unknown>) => {
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken?.toString();
    if (!idToken) {
      throw new Error('No session token found. Please sign in again.');
    }

    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(body),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || 'Request failed.');
    }
    return payload;
  }, []);

  const resolveUserByEmail = useCallback(async (email: string): Promise<CognitoUser> => {
    const payload = await callAdminApi({ action: 'getUserByEmail', email });
    return payload.user as CognitoUser;
  }, [callAdminApi]);

  const customerUsersForSelected = useMemo(
    () => allCustomerUsers.filter((user) => user.customerId === selectedCustomerId),
    [allCustomerUsers, selectedCustomerId]
  );

  const hasAccountOwner = useMemo(
    () => customerUsersForSelected.some((user) => user.role === 'account_owner'),
    [customerUsersForSelected]
  );

  const clientUsersCount = allCustomerUsers.length;

  const accountOwnersCount = useMemo(
    () => allCustomerUsers.filter((user) => user.role === 'account_owner').length,
    [allCustomerUsers]
  );

  const customerNameById = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer.name])),
    [customers]
  );

  const distinctCustomerCount = useMemo(
    () => new Set(allCustomerUsers.map((user) => user.customerId)).size,
    [allCustomerUsers]
  );

  const cognitoUserBySub = useMemo(
    () => new Map(customerGroupCognitoUsers.map((user) => [user.sub, user])),
    [customerGroupCognitoUsers]
  );

  // Joins each CustomerUser onto its Cognito record for Status/Last seen --
  // "Invite sent" mirrors getUserActivityStats' pendingInvites definition
  // (still FORCE_CHANGE_PASSWORD, i.e. never signed in with the temp password).
  const customerUserRows: Array<CustomerUserRowData & CustomerUser> = useMemo(
    () =>
      allCustomerUsers.map((user) => {
        const cognitoUser = cognitoUserBySub.get(user.userSub);
        const status: CustomerUserRowData['status'] =
          cognitoUser?.status === 'FORCE_CHANGE_PASSWORD' ? 'Invite sent' : 'Active';
        return {
          ...user,
          role: user.role ?? 'read_only',
          customerName: customerNameById.get(user.customerId) ?? 'Unknown customer',
          status,
          lastSeen: cognitoUser?.updatedAt,
          name: user.name ?? user.email ?? 'Unnamed user',
          email: user.email ?? '',
        };
      }),
    [allCustomerUsers, cognitoUserBySub, customerNameById]
  );

  const { sortBy: usersSortBy, sortDirection: usersSortDirection, toggleSort: toggleUsersSort } =
    useAdminTableSort<CustomerUserSortKey>();
  const [usersPage, setUsersPage] = useState(1);

  useEffect(() => {
    setUsersPage(1);
  }, [usersSortBy, usersSortDirection]);

  const sortedCustomerUserRows = useMemo(() => {
    if (!usersSortBy) return customerUserRows;
    const value = (row: CustomerUserRowData) => {
      if (usersSortBy === 'name') return row.name;
      if (usersSortBy === 'customer') return row.customerName;
      if (usersSortBy === 'role') return row.role;
      return row.status;
    };
    const sorted = [...customerUserRows].sort((a, b) =>
      value(a).localeCompare(value(b), undefined, { numeric: true, sensitivity: 'base' })
    );
    if (usersSortDirection === 'desc') sorted.reverse();
    return sorted;
  }, [customerUserRows, usersSortBy, usersSortDirection]);

  const {
    currentPage: usersCurrentPage,
    totalPages: usersTotalPages,
    pageRows: pageCustomerUserRows,
  } = getPageSlice(sortedCustomerUserRows, usersPage, ADMIN_PAGE_SIZE);

  // ── Customer Access ──────────────────────────────────────────────
  const loadCustomers = useCallback(async () => {
    const allCustomers: CustomerSummary[] = [];
    let nextToken: string | undefined;

    do {
      const result = await listCustomers({ limit: 100, nextToken });
      if (result.errors && result.errors.length > 0) {
        return;
      }

      allCustomers.push(...((result.data as CustomerSummary[]) ?? []));
      nextToken = result.nextToken ?? undefined;
    } while (nextToken);

    setCustomers(allCustomers);
    if (allCustomers.length > 0 && !selectedCustomerId) {
      setSelectedCustomerId(allCustomers[0].id);
    }
  }, [selectedCustomerId]);

  const loadAllCustomerUsers = useCallback(async () => {
    setCustomerUsersLoading(true);
    setTableLoadError(null);
    const result = await listAllCustomerUsers();
    if (!result.errors || result.errors.length === 0) {
      setAllCustomerUsers(result.data as CustomerUser[]);
      setCustomerUsersLoading(false);
      return;
    }

    setAllCustomerUsers([]);
    setCustomerUsersLoading(false);
    const message = (result.errors[0] as Error | undefined)?.message;
    if (message?.includes('CustomerUser model is not available')) {
      setTableLoadError('Customer access management is unavailable until backend schema changes are deployed.');
    } else {
      setTableLoadError('Failed to load customer users.');
    }
  }, []);

  // Full customer-group roster (paginated to completion server-side) purely
  // to join Cognito Status/UserLastModifiedDate onto each row below -- never
  // used for the "Manage User Groups" selector, which stays scoped to the
  // pool-wide preview from loadUsers().
  const loadCustomerGroupUsers = useCallback(async () => {
    try {
      const payload = await callAdminApi({ action: 'listUsersInGroup', groupName: 'customer' });
      setCustomerGroupCognitoUsers((payload.users as CognitoUser[]) || []);
    } catch {
      // Non-blocking -- rows just fall back to "Active" with no last-seen date.
    }
  }, [callAdminApi]);

  const loadActivityStats = useCallback(async () => {
    try {
      const payload = await callAdminApi({ action: 'getUserActivityStats' });
      setActivityStats({
        pendingInvites: (payload.pendingInvites as number) ?? 0,
        signedInLast7Days: (payload.signedInLast7Days as number) ?? 0,
        signedInStatsAvailable: payload.signedInStatsAvailable !== false,
      });
    } catch {
      // Non-blocking -- the rest of the page works without activity stats.
    }
  }, [callAdminApi]);

  useEffect(() => {
    void loadCustomers();
    void loadAllCustomerUsers();
    void loadCustomerGroupUsers();
    void loadActivityStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setAccessError(null);
    setAccessSuccess(null);
  }, [selectedCustomerId]);

  useEffect(() => {
    if (!selectedCustomerId) {
      return;
    }

    if (!hasAccountOwner && newUserRole !== 'account_owner') {
      setNewUserRole('account_owner');
    }
  }, [hasAccountOwner, newUserRole, selectedCustomerId]);

  const handleAddCustomerUser = async () => {
    if (!newUserEmail.trim()) {
      setAccessError('User email is required.');
      return;
    }

    const normalizedEmail = newUserEmail.trim().toLowerCase();
    const resolvedUser = await resolveUserByEmail(normalizedEmail).catch(() => null);

    const owner = customerUsersForSelected.find((u) => u.role === 'account_owner');
    if (newUserRole === 'read_only' && !owner) {
      setAccessError('No account owner assigned for this customer yet. Assign a primary contact first.');
      return;
    }
    if (newUserRole === 'account_owner' && owner && owner.userSub !== resolvedUser?.sub) {
      setAccessError('This customer already has a primary contact. Remove the current owner before assigning a new one.');
      return;
    }

    setAccessPending(true);
    setAccessError(null);
    setAccessSuccess(null);

    try {
      let assignedUserSub: string;
      let invited = false;
      let emailSent = false;

      if (resolvedUser?.sub && resolvedUser.username) {
        // Already has a Cognito account -- just make sure they're in the customer group.
        assignedUserSub = resolvedUser.sub;
        const userGroupsPayload = await callAdminApi({
          action: 'listGroupsForUser',
          username: resolvedUser.username,
        });
        const userGroups = (userGroupsPayload.groups as string[]) || [];
        if (!userGroups.includes('customer')) {
          await callAdminApi({
            action: 'addUserToGroup',
            username: resolvedUser.username,
            groupName: 'customer',
          });
        }
      } else {
        // No existing Cognito account for this email -- create one for real right
        // now and invite them (Cognito emails a temporary password), rather than
        // pre-assigning a placeholder record for a self-service signup that no
        // longer exists.
        const createPayload = await callAdminApi({
          action: 'createUser',
          email: normalizedEmail,
          name: newUserName || undefined,
          groupName: 'customer',
          customerName: customers.find((c) => c.id === selectedCustomerId)?.name,
        });
        const createdUser = (createPayload.user as { sub?: string } | undefined) || {};
        if (!createdUser.sub) {
          setAccessError('Could not create a login for this email.');
          setAccessPending(false);
          return;
        }
        assignedUserSub = createdUser.sub;
        invited = true;
        emailSent = Boolean(createPayload.emailSent);
      }

      const existing =
        customerUsersForSelected.find((u) => u.userSub === assignedUserSub) ||
        customerUsersForSelected.find((u) => (u.email || '').toLowerCase() === normalizedEmail);
      let createdCustomerUserId: string | undefined;
      if (!existing) {
        const result = await createCustomerUser({
          customerId: selectedCustomerId,
          userSub: assignedUserSub,
          accountOwnerSub:
            newUserRole === 'account_owner'
              ? assignedUserSub
              : (owner?.userSub || assignedUserSub),
          role: newUserRole,
          name: newUserName || resolvedUser?.name || resolvedUser?.firstName || undefined,
          email: normalizedEmail,
        });

        if (result.errors && result.errors.length > 0) {
          setAccessError('Failed to add user to customer.');
          setAccessPending(false);
          return;
        }

        createdCustomerUserId = (result.data as { id?: string } | null)?.id;
      }

      const updated = [...customerUsersForSelected];
      if (!existing) {
        updated.push({
          id: createdCustomerUserId || `temp-${assignedUserSub}`,
          customerId: selectedCustomerId,
          userSub: assignedUserSub,
          accountOwnerSub:
            newUserRole === 'account_owner'
              ? assignedUserSub
              : (owner?.userSub || assignedUserSub),
          role: newUserRole,
          name: newUserName || resolvedUser?.name || resolvedUser?.firstName || undefined,
          email: normalizedEmail,
        });
      }
      const viewerSubs = toViewerSubs(updated);
      await syncViewerSubsForCustomer(selectedCustomerId, viewerSubs);

      setAccessSuccess(
        invited
          ? emailSent
            ? 'Account created — we emailed them a branded invitation with a temporary password. Access is synced.'
            : 'Account created, but the invitation email could not be sent. Ask the user to use "Forgot password" to get access.'
          : 'User assigned to customer and access synced to all routes and stops.'
      );
      setNewUserEmail('');
      setNewUserRole('read_only');
      setNewUserName('');
      setAllCustomerUsers((prev) => [...prev.filter((u) => u.customerId !== selectedCustomerId), ...updated]);
    } catch (e) {
      setAccessError(e instanceof Error ? e.message : 'Failed to assign customer access.');
    }

    setAccessPending(false);
  };

  const handleRemoveCustomerUser = async (target: CustomerUser) => {
    setAccessPending(true);
    setAccessError(null);
    setAccessSuccess(null);

    const result = await deleteCustomerUser(target.id);
    if (result.errors && result.errors.length > 0) {
      setAccessError('Failed to remove user.');
    } else {
      const remainingForCustomer = allCustomerUsers.filter(
        (u) => u.customerId === target.customerId && u.id !== target.id
      );
      await syncViewerSubsForCustomer(target.customerId, toViewerSubs(remainingForCustomer));

      setAccessSuccess('User removed and access revoked from all routes and stops.');
      setAllCustomerUsers((prev) => prev.filter((u) => u.id !== target.id));
    }
    setAccessPending(false);
    setRemovalTarget(null);
  };

  const openEditDialog = (target: CustomerUser) => {
    setEditTarget(target);
    setEditName(target.name ?? '');
    setEditRole(target.role ?? 'read_only');
    setAccessError(null);
    setAccessSuccess(null);
  };

  const closeEditDialog = () => {
    if (accessPending) return;
    setEditTarget(null);
  };

  const handleUpdateCustomerUser = async () => {
    if (!editTarget) return;

    const trimmedName = editName.trim();
    const roleChanged = editRole !== editTarget.role;

    if (roleChanged) {
      const otherOwner = customerUsersForSelected.find(
        (u) => u.role === 'account_owner' && u.id !== editTarget.id
      );
      if (editRole === 'account_owner' && otherOwner) {
        setAccessError(
          'This customer already has a primary contact. Remove or change the current owner before assigning a new one.'
        );
        return;
      }
      if (editRole === 'read_only' && editTarget.role === 'account_owner') {
        setAccessError('Promote a teammate to primary contact before changing this one to read-only.');
        return;
      }
    }

    setAccessPending(true);
    setAccessError(null);
    setAccessSuccess(null);

    // Promoting a user to account owner re-keys the denormalized accountOwnerSub
    // carried on every CustomerUser row for this customer -- it must stay the
    // same value across all rows (see amplify/data/resource.ts) so the new
    // owner's ownerDefinedIn('accountOwnerSub') grant actually resolves.
    const promotingToOwner = roleChanged && editRole === 'account_owner';
    const newOwnerSub = editTarget.userSub;

    const result = await updateCustomerUser({
      id: editTarget.id,
      name: trimmedName || undefined,
      role: editRole,
      ...(promotingToOwner ? { accountOwnerSub: newOwnerSub } : {}),
    });

    if (result.errors && result.errors.length > 0) {
      setAccessError('Failed to update user.');
      setAccessPending(false);
      return;
    }

    if (promotingToOwner) {
      const rowsToRekey = customerUsersForSelected.filter(
        (u) => u.id !== editTarget.id && u.accountOwnerSub !== newOwnerSub
      );
      await Promise.all(rowsToRekey.map((u) => updateCustomerUser({ id: u.id, accountOwnerSub: newOwnerSub })));
    }

    setAllCustomerUsers((prev) =>
      prev.map((u) => {
        if (u.id === editTarget.id) {
          return { ...u, name: trimmedName || undefined, role: editRole, ...(promotingToOwner ? { accountOwnerSub: newOwnerSub } : {}) };
        }
        if (promotingToOwner && u.customerId === editTarget.customerId) {
          return { ...u, accountOwnerSub: newOwnerSub };
        }
        return u;
      })
    );

    setAccessSuccess('User updated.');
    setAccessPending(false);
    setEditTarget(null);
  };

  const handleResendInvite = async (row: CustomerUserRowData & CustomerUser) => {
    setResendingId(row.id);
    setAccessError(null);
    setAccessSuccess(null);
    try {
      const payload = await callAdminApi({
        action: 'resendInvite',
        email: row.email,
        groupName: 'customer',
        name: row.name,
        customerName: row.customerName,
      });
      setAccessSuccess(
        payload.emailSent
          ? `Invitation resent to ${row.email}.`
          : `Invitation reset for ${row.email}, but the email could not be sent. Ask them to use "Forgot password".`
      );
    } catch (e) {
      setAccessError(e instanceof Error ? e.message : 'Failed to resend invite.');
    }
    setResendingId(null);
  };

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.page}>
        <PageHeader title="Users" />

        <div className={styles.statsGrid}>
          <StatTile
            label="Customer users"
            value={clientUsersCount}
            caption={`across ${distinctCustomerCount} customer${distinctCustomerCount === 1 ? '' : 's'}`}
            icon="users"
          />
          <StatTile label="Account owners" value={accountOwnersCount} caption="one per customer" icon="building-2" />
          <StatTile label="Invites pending" value={activityStats?.pendingInvites ?? '—'} caption="sent, not activated" icon="bell" />
          <StatTile
            label="Signed in past 7d"
            value={activityStats?.signedInStatsAvailable === false ? 'Unavailable' : (activityStats?.signedInLast7Days ?? '—')}
            caption={activityStats?.signedInStatsAvailable === false ? 'Requires Cognito advanced security' : `of ${clientUsersCount} users`}
            icon="trending-up"
          />
        </div>
        <ConfirmDialog
          open={removalTarget !== null}
          title="Revoke customer access?"
          message={`Revoke ${removalTarget?.name ?? removalTarget?.email ?? 'this user'}'s customer access? Their access to this customer's routes and stops will be revoked.`}
          confirmLabel="Revoke Access"
          tone="danger"
          busy={accessPending}
          onConfirm={() => {
            if (removalTarget) void handleRemoveCustomerUser(removalTarget);
          }}
          onCancel={() => {
            if (!accessPending) setRemovalTarget(null);
          }}
        />

        <Dialog
          open={editTarget !== null}
          title={editTarget ? `Edit ${editTarget.name ?? editTarget.email ?? 'user'}` : ''}
          description={editTarget ? customerNameById.get(editTarget.customerId) : undefined}
          onClose={closeEditDialog}
          footer={
            <>
              <Button
                type="button"
                variant="danger"
                disabled={accessPending}
                onClick={() => {
                  if (editTarget) {
                    setRemovalTarget(editTarget);
                    setEditTarget(null);
                  }
                }}
              >
                Revoke Access
              </Button>
              <Button type="button" variant="secondary" disabled={accessPending} onClick={closeEditDialog}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                loading={accessPending}
                disabled={accessPending}
                onClick={() => void handleUpdateCustomerUser()}
              >
                {accessPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </>
          }
        >
          {accessError && (
            <div className={styles.errorBanner} role="alert" aria-live="assertive">
              {accessError}
            </div>
          )}
          <Field label="Display Name" htmlFor="editCustomerUserName">
            <Input
              id="editCustomerUserName"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Display name"
              disabled={accessPending}
            />
          </Field>
          <div className={styles.roleFieldset} role="radiogroup" aria-label="Role">
            <span className={styles.fieldLabel}>Role</span>
            <div className={styles.roleOptions}>
              <Radio
                name="editCustomerUserRole"
                value="account_owner"
                checked={editRole === 'account_owner'}
                onChange={() => setEditRole('account_owner')}
                disabled={accessPending || (editTarget?.role !== 'account_owner' && hasAccountOwner)}
                label="Primary contact (account owner)"
                description="Manages billing, standing orders, and invoices; can invite and remove teammates."
              />
              <Radio
                name="editCustomerUserRole"
                value="read_only"
                checked={editRole === 'read_only'}
                onChange={() => setEditRole('read_only')}
                disabled={accessPending || editTarget?.role === 'account_owner'}
                label="Read-only"
                description="Views routes and delivery stops, and can add delivery instructions. Can't manage billing or invites."
              />
            </div>
          </div>
        </Dialog>

        {(accessError || accessSuccess) && (
          <>
            {accessError && (
              <div className={styles.errorBanner} role="alert" aria-live="assertive">
                {accessError}
              </div>
            )}
            {accessSuccess && (
              <div className={styles.successBanner} role="status" aria-live="polite">
                {accessSuccess}
              </div>
            )}
          </>
        )}

        <div className={styles.usersGrid}>
          <Card
            title="All customer users"
            subtitle="Role decides what they can see"
            padded={Boolean(customerUsersLoading || tableLoadError || sortedCustomerUserRows.length === 0)}
          >
            {tableLoadError ? (
              <div className={styles.errorBanner} role="alert" aria-live="assertive">{tableLoadError}</div>
            ) : customerUsersLoading ? (
              <p className={styles.mutedText}>Loading customer users...</p>
            ) : sortedCustomerUserRows.length === 0 ? (
              <p className={styles.mutedText}>No customer users yet -- invite one to get started.</p>
            ) : (
              <>
                <div className={styles.tableWrap}>
                  <table className="nd-table nd-table--hoverable" aria-label="All customer users">
                    <thead>
                      <tr>
                        <SortableHeader label="User" sortKey="name" sortBy={usersSortBy} sortDirection={usersSortDirection} onSort={toggleUsersSort} />
                        <SortableHeader label="Customer" sortKey="customer" sortBy={usersSortBy} sortDirection={usersSortDirection} onSort={toggleUsersSort} />
                        <SortableHeader label="Role" sortKey="role" sortBy={usersSortBy} sortDirection={usersSortDirection} onSort={toggleUsersSort} />
                        <SortableHeader label="Status" sortKey="status" sortBy={usersSortBy} sortDirection={usersSortDirection} onSort={toggleUsersSort} />
                        <th scope="col">Last seen</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageCustomerUserRows.map((row) => (
                        <CustomerUserTableRow
                          key={row.id}
                          row={row}
                          resending={resendingId === row.id}
                          onChangeRole={() => openEditDialog(row)}
                          onResend={() => void handleResendInvite(row)}
                          onRevoke={() => setRemovalTarget(row)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                <nav className={styles.paginationBar} aria-label="customer users pagination">
                  <p className={styles.paginationSummary} aria-live="polite">
                    {`Showing ${(usersCurrentPage - 1) * ADMIN_PAGE_SIZE + 1}–${Math.min(sortedCustomerUserRows.length, usersCurrentPage * ADMIN_PAGE_SIZE)} of ${sortedCustomerUserRows.length} users`}
                  </p>
                  <div className={styles.paginationControls}>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={usersCurrentPage <= 1}
                      onClick={() => setUsersPage(usersCurrentPage - 1)}
                      aria-label="Previous page of customer users"
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={usersCurrentPage >= usersTotalPages}
                      onClick={() => setUsersPage(usersCurrentPage + 1)}
                      aria-label="Next page of customer users"
                    >
                      Next
                    </Button>
                  </div>
                </nav>
              </>
            )}
          </Card>

          <div className={styles.usersGridSide}>
            <Card
              title="Invite a user"
              subtitle="They'll get a login in the customer group, assigned to the customer below as either primary contact (account owner) or read-only."
            >
              <div className={styles.form}>
                <Field label="Customer" htmlFor="customerSelect">
                  <Select
                    id="customerSelect"
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    disabled={accessPending}
                    aria-label="Customer for access management"
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </Field>

                {selectedCustomerId && (
                  <>
                    <p className={styles.mutedText}>
                      Enter the user email. Users in the customer group must be assigned to a customer.
                    </p>
                    {!hasAccountOwner && (
                      <p className={styles.mutedText}>
                        This customer has no primary contact yet. Assign a primary contact first before adding read-only users.
                      </p>
                    )}
                    <div className={styles.roleFieldset} role="radiogroup" aria-label="Role for new customer user">
                      <span className={styles.fieldLabel}>Role</span>
                      <div className={styles.roleOptions}>
                        <Radio
                          name="newCustomerRole"
                          value="account_owner"
                          checked={newUserRole === 'account_owner'}
                          onChange={() => setNewUserRole('account_owner')}
                          disabled={accessPending}
                          label="Primary contact (account owner)"
                          description="Manages billing, standing orders, and invoices; can invite and remove teammates."
                        />
                        <Radio
                          name="newCustomerRole"
                          value="read_only"
                          checked={newUserRole === 'read_only'}
                          onChange={() => setNewUserRole('read_only')}
                          disabled={accessPending || !hasAccountOwner}
                          label="Read-only"
                          description="Views routes and delivery stops, and can add delivery instructions. Can't manage billing or invites."
                        />
                      </div>
                    </div>
                    <Field label="Email" htmlFor="newCustomerEmail">
                      <Input
                        id="newCustomerEmail"
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                        placeholder="name@agency.com.au"
                        disabled={accessPending}
                        type="email"
                        aria-label="Email for new customer user"
                      />
                    </Field>
                    <Field label="Display name (optional)" htmlFor="newCustomerName">
                      <Input
                        id="newCustomerName"
                        value={newUserName}
                        onChange={(e) => setNewUserName(e.target.value)}
                        placeholder="e.g. Betty O'Shea"
                        disabled={accessPending}
                        aria-label="Optional display name for new customer user"
                      />
                    </Field>
                    <Button
                      type="button"
                      block
                      iconLeft="plus"
                      loading={accessPending}
                      disabled={accessPending || !newUserEmail.trim()}
                      aria-label="Add customer user"
                      onClick={() => void handleAddCustomerUser()}
                    >
                      {accessPending ? 'Saving...' : 'Send invite'}
                    </Button>
                  </>
                )}
              </div>
            </Card>

            <Card title="What each role sees" subtitle="A quick reference for choosing a role when adding a customer user.">
              <div className={styles.roleExplainerGrid}>
                <div className={styles.roleExplainerItem}>
                  <Badge tone="success">Owner</Badge>
                  <p className={styles.mutedText}>
                    Metrics with cost, billing history, standing orders, billing details.
                  </p>
                </div>
                <div className={styles.roleExplainerItem}>
                  <Badge tone="neutral">Read-only</Badge>
                  <p className={styles.mutedText}>
                    Metrics without cost, routes, standing orders, route instructions.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </OperatorRoute>
  );
}
