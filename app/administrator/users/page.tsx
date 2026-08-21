'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import ConfirmDialog from '@/app/components/ConfirmDialog';
import OperatorRoute from '@/app/components/OperatorRoute';
import AdminRowMenu from '@/app/components/AdminRowMenu';
import PageHeader from '@/app/administrator/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Select } from '@/app/components/ui/forms/Select';
import { Badge } from '@/app/components/ui/core/Badge';
import { StatTile } from '@/app/components/ui/data/StatTile';
import {
  createCustomerUser,
  deleteCustomerUser,
  listCustomerUsers,
  listCustomers,
  syncViewerSubsForCustomer,
} from '@/lib/queries';
import UserSelectorControl from '@/app/administrator/users/components/UserSelectorControl';
import GroupMembershipSection from '@/app/administrator/users/components/GroupMembershipSection';
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

const GROUPS = ['customer', 'operator', 'administrator'] as const;
const PENDING_SUB_PREFIX = 'pending:';

function toPendingSub(email: string) {
  return `${PENDING_SUB_PREFIX}${email.trim().toLowerCase()}`;
}

function toViewerSubs(users: Array<{ userSub?: string | null }>) {
  return [
    ...new Set(
      users
        .map((user) => (user.userSub || '').trim())
        .filter((userSub): userSub is string => Boolean(userSub) && !userSub.startsWith(PENDING_SUB_PREFIX))
    ),
  ];
}

export default function UsersAdminPage() {
  const [users, setUsers] = useState<CognitoUser[]>([]);
  const [listUsersDenied, setListUsersDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedUsername, setSelectedUsername] = useState<string>('');
  const [selectedEmailInput, setSelectedEmailInput] = useState<string>('');
  const [groups, setGroups] = useState<string[]>([]);

  // Customer Access section state
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerUsers, setCustomerUsers] = useState<CustomerUser[]>([]);
  const [accessPending, setAccessPending] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessSuccess, setAccessSuccess] = useState<string | null>(null);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'account_owner' | 'read_only'>('read_only');
  const [newUserName, setNewUserName] = useState('');
  const [removalTarget, setRemovalTarget] = useState<CustomerUser | null>(null);

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

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    setListUsersDenied(false);
    try {
      const payload = await callAdminApi({ action: 'listUsers' });
      const fetchedUsers = (payload.users as CognitoUser[]) || [];
      setUsers(fetchedUsers);

      if (fetchedUsers.length > 0 && !selectedUsername && fetchedUsers[0].username) {
        setSelectedUsername(fetchedUsers[0].username);
        setSelectedEmailInput(fetchedUsers[0].email || fetchedUsers[0].username || '');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load users.';
      if (message.includes('cognito-idp:ListUsers')) {
        setListUsersDenied(true);
        setUsers([]);
        setError(
          'ListUsers permission is not available for the current server credentials. Enter a username manually to manage groups, or grant cognito-idp:ListUsers.'
        );
      } else {
        setError(message);
      }
    }
    setLoading(false);
  }, [callAdminApi, selectedUsername]);

  const loadGroups = useCallback(async (username: string) => {
    if (!username) return;
    setPending(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const payload = await callAdminApi({ action: 'listGroupsForUser', username });
      setGroups((payload.groups as string[]) || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load groups.');
    }
    setPending(false);
  }, [callAdminApi]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (selectedUsername) {
      void loadGroups(selectedUsername);
    }
  }, [selectedUsername, loadGroups]);

  const hasAccountOwner = useMemo(
    () => customerUsers.some((user) => user.role === 'account_owner'),
    [customerUsers]
  );

  const selectedUser = useMemo(
    () => users.find((user) => user.username === selectedUsername),
    [users, selectedUsername]
  );

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

  const loadCustomerUsers = useCallback(async (customerId: string) => {
    if (!customerId) return;
    const result = await listCustomerUsers(customerId);
    if (!result.errors || result.errors.length === 0) {
      setCustomerUsers(result.data as CustomerUser[]);
      return;
    }

    setCustomerUsers([]);
    const message = (result.errors[0] as Error | undefined)?.message;
    if (message?.includes('CustomerUser model is not available')) {
      setAccessError('Customer access management is unavailable until backend schema changes are deployed.');
    } else {
      setAccessError('Failed to load customer users.');
    }
  }, []);

  useEffect(() => {
    void loadCustomers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedCustomerId) {
      setAccessError(null);
      setAccessSuccess(null);
      void loadCustomerUsers(selectedCustomerId);
    }
  }, [selectedCustomerId, loadCustomerUsers]);

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
    const pendingUserSub = toPendingSub(normalizedEmail);
    const resolvedUser = await resolveUserByEmail(normalizedEmail).catch(() => null);
    const assignedUserSub = resolvedUser?.sub || pendingUserSub;

    const owner = customerUsers.find((u) => u.role === 'account_owner');
    if (newUserRole === 'read_only' && !owner) {
      setAccessError('No account owner assigned for this customer yet. Assign a primary contact first.');
      return;
    }
    if (newUserRole === 'account_owner' && owner && owner.userSub !== assignedUserSub) {
      setAccessError('This customer already has a primary contact. Remove the current owner before assigning a new one.');
      return;
    }

    setAccessPending(true);
    setAccessError(null);
    setAccessSuccess(null);

    try {
      // If the Cognito user already exists, ensure they are in the customer group now.
      // If they do not exist yet, the post-confirmation trigger will apply this automatically.
      if (resolvedUser?.username) {
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
      }

      const existing =
        customerUsers.find((u) => u.userSub === assignedUserSub) ||
        customerUsers.find((u) => (u.email || '').toLowerCase() === normalizedEmail);
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

      const updated = [...customerUsers];
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
        resolvedUser?.sub
          ? 'User assigned to customer and access synced to all routes and stops.'
          : 'Customer access is pre-assigned. When this email registers, role access will activate automatically.'
      );
      setNewUserEmail('');
      setNewUserRole('read_only');
      setNewUserName('');
      setCustomerUsers(updated);
    } catch (e) {
      setAccessError(e instanceof Error ? e.message : 'Failed to assign customer access.');
    }

    setAccessPending(false);
  };

  const handleRemoveCustomerUser = async (customerUserId: string) => {
    setAccessPending(true);
    setAccessError(null);
    setAccessSuccess(null);

    const result = await deleteCustomerUser(customerUserId);
    if (result.errors && result.errors.length > 0) {
      setAccessError('Failed to remove user.');
    } else {
      const updated = customerUsers.filter((u) => u.id !== customerUserId);
      const viewerSubs = toViewerSubs(updated);
      await syncViewerSubsForCustomer(selectedCustomerId, viewerSubs);

      setAccessSuccess('User removed and access revoked from all routes and stops.');
      setCustomerUsers(updated);
    }
    setAccessPending(false);
    setRemovalTarget(null);
  };

  const assignGroup = async (groupName: (typeof GROUPS)[number]) => {
    if (!selectedUsername) return;
    setPending(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const selectedUser =
        users.find((u) => u.username === selectedUsername) ||
        (selectedEmailInput ? await resolveUserByEmail(selectedEmailInput).catch(() => undefined) : undefined);

      if (groupName === 'customer') {
        if (!selectedUser?.sub) {
          setError('Unable to resolve selected user details. Refresh users and try again.');
          setPending(false);
          return;
        }
        if (!selectedCustomerId) {
          setError('Select a customer before assigning the customer group.');
          setPending(false);
          return;
        }
      }

      await callAdminApi({ action: 'addUserToGroup', username: selectedUsername, groupName });

      if (groupName === 'customer') {
        const owner = customerUsers.find((u) => u.role === 'account_owner');
        if (selectedUser?.sub) {
          const existing = customerUsers.find((u) => u.userSub === selectedUser.sub);
          // Preserve existing role if present. If no record exists, first user becomes owner,
          // and all subsequent users are read_only when an owner already exists.
          const targetRole: 'account_owner' | 'read_only' = existing?.role === 'account_owner'
            ? 'account_owner'
            : existing?.role === 'read_only'
              ? 'read_only'
              : owner && owner.userSub !== selectedUser.sub
                ? 'read_only'
                : 'account_owner';
          const accountOwnerSub = targetRole === 'account_owner'
            ? selectedUser.sub
            : (owner?.userSub || selectedUser.sub);

          if (!existing) {
            const customerUserResult = await createCustomerUser({
              customerId: selectedCustomerId,
              userSub: selectedUser.sub,
              accountOwnerSub,
              role: targetRole,
              name: selectedUser.name || selectedUser.firstName || undefined,
              email: selectedUser.email || undefined,
            });

            if (customerUserResult.errors && customerUserResult.errors.length > 0) {
              await callAdminApi({
                action: 'removeUserFromGroup',
                username: selectedUsername,
                groupName: 'customer',
              });
              setError('Failed to assign customer access. Customer group assignment was rolled back.');
              setPending(false);
              return;
            }
          }

          const updatedUsers = existing
            ? customerUsers
            : [
                ...customerUsers,
                {
                  id: `temp-${selectedUser.sub}`,
                  customerId: selectedCustomerId,
                  userSub: selectedUser.sub,
                  accountOwnerSub,
                  role: targetRole,
                  name: selectedUser.name || selectedUser.firstName || undefined,
                  email: selectedUser.email || undefined,
                },
              ];
          await syncViewerSubsForCustomer(
            selectedCustomerId,
            toViewerSubs(updatedUsers)
          );
          setCustomerUsers(updatedUsers);
        }
      }

      setGroups((prev) => (prev.includes(groupName) ? prev : [...prev, groupName]));
      setSuccessMessage(
        `Assigned ${groupName} to ${selectedEmailInput || selectedUsername}. The user should sign out and sign back in to refresh permissions.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to assign group.');
    }
    setPending(false);
  };

  const removeGroup = async (groupName: (typeof GROUPS)[number]) => {
    if (!selectedUsername) return;
    setPending(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await callAdminApi({ action: 'removeUserFromGroup', username: selectedUsername, groupName });

      if (groupName === 'customer' && selectedCustomerId) {
        const selectedUser =
          users.find((user) => user.username === selectedUsername) ||
          (selectedEmailInput
            ? await resolveUserByEmail(selectedEmailInput).catch(() => undefined)
            : undefined);

        const normalizedEmail = (selectedEmailInput || selectedUser?.email || '').trim().toLowerCase();
        const customerUserToRemove = customerUsers.find((customerUser) => {
          if (selectedUser?.sub && customerUser.userSub === selectedUser.sub) {
            return true;
          }

          return Boolean(
            normalizedEmail &&
            customerUser.email &&
            customerUser.email.trim().toLowerCase() === normalizedEmail
          );
        });

        if (customerUserToRemove) {
          const removeCustomerUserResult = await deleteCustomerUser(customerUserToRemove.id);
          if (removeCustomerUserResult.errors && removeCustomerUserResult.errors.length > 0) {
            setError('Customer group removed, but customer access record cleanup failed.');
            setPending(false);
            return;
          }

          const updatedCustomerUsers = customerUsers.filter(
            (customerUser) => customerUser.id !== customerUserToRemove.id
          );
          await syncViewerSubsForCustomer(selectedCustomerId, toViewerSubs(updatedCustomerUsers));
          setCustomerUsers(updatedCustomerUsers);
        }
      }

      setGroups((prev) => prev.filter((group) => group !== groupName));
      setSuccessMessage(
        `Removed ${groupName} from ${selectedEmailInput || selectedUsername}. The user should sign out and sign back in to refresh permissions.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove group.');
    }
    setPending(false);
  };

  const handleLoadGroupsByEmail = async () => {
    if (!selectedEmailInput) return;
    try {
      const resolved = await resolveUserByEmail(selectedEmailInput);
      if (!resolved.username) {
        setError('Unable to resolve username for this email.');
        return;
      }
      setSelectedUsername(resolved.username);
      await loadGroups(resolved.username);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to resolve user by email.');
    }
  };

  const handleSelectUsername = (username: string) => {
    setSelectedUsername(username);
    const selected = users.find((user) => user.username === username);
    setSelectedEmailInput(selected?.email || selected?.username || '');
  };

  const handleToggleGroup = (group: string, checked: boolean) => {
    if (checked) {
      void assignGroup(group as (typeof GROUPS)[number]);
      return;
    }
    void removeGroup(group as (typeof GROUPS)[number]);
  };

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.page}>
        <PageHeader title="Users" />

        <div className={styles.statsGrid}>
          <StatTile label="Total users" value={users.length} icon="users" />
          <StatTile label="Customer accounts" value={customers.length} icon="building-2" />
          <StatTile label="Customer's users" value={customerUsers.length} icon="user" />
          <StatTile label="Primary contact" value={hasAccountOwner ? 'Assigned' : 'Missing'} icon="user" />
        </div>
        <ConfirmDialog
          open={removalTarget !== null}
          title="Remove customer access?"
          message={`Remove ${removalTarget?.name ?? removalTarget?.email ?? 'this user'} from customer access? Their access to this customer's routes and stops will be revoked.`}
          confirmLabel="Remove User"
          tone="danger"
          busy={accessPending}
          onConfirm={() => {
            if (removalTarget) void handleRemoveCustomerUser(removalTarget.id);
          }}
          onCancel={() => {
            if (!accessPending) setRemovalTarget(null);
          }}
        />

        <Card
          title="Manage User Groups"
          subtitle="Assign and revoke customer, operator, and administrator groups by user email. Users must sign up via Request Access and set their own password during sign-up."
        >
          {error && <div className={styles.errorBanner} role="alert" aria-live="assertive">{error}</div>}
          {error && !listUsersDenied && (
            <div className={styles.sectionRow} style={{ marginTop: 'var(--space-3)' }}>
              <Button
                type="button"
                variant="secondary"
                loading={loading}
                aria-label="Retry loading users"
                onClick={() => void loadUsers()}
              >
                {loading ? 'Retrying...' : 'Retry'}
              </Button>
            </div>
          )}
          {successMessage && (
            <div className={styles.successBanner} role="status" aria-live="polite">{successMessage}</div>
          )}

          <UserSelectorControl
            listUsersDenied={listUsersDenied}
            selectedEmailInput={selectedEmailInput}
            selectedUsername={selectedUsername}
            users={users}
            loading={loading}
            pending={pending}
            onEmailInputChange={setSelectedEmailInput}
            onLoadGroupsByEmail={handleLoadGroupsByEmail}
            onSelectUsername={handleSelectUsername}
            onRefreshUsers={() => {
              void loadUsers();
            }}
          />

          <GroupMembershipSection
            selectedUsername={selectedUsername}
            selectedUser={selectedUser}
            selectedCustomerId={selectedCustomerId}
            pending={pending}
            groups={groups}
            groupOptions={GROUPS}
            onToggleGroup={handleToggleGroup}
          />
        </Card>

        {/* ── Customer Access ── */}
        <Card
          title="Customer Access"
          subtitle="Customer-group users must be assigned to a customer. Assign each user by email as either primary contact (account owner) or read-only."
        >
          {accessError && <div className={styles.errorBanner} role="alert" aria-live="assertive">{accessError}</div>}
          {accessSuccess && (
            <div className={styles.successBanner} role="status" aria-live="polite">{accessSuccess}</div>
          )}

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
            <div>
              <h4 className={styles.subheading}>Users for this customer</h4>
              {customerUsers.length === 0 ? (
                <p className={styles.mutedText}>No users assigned yet.</p>
              ) : (
                <ul className={styles.userList}>
                  {customerUsers.map((cu) => (
                    <li key={cu.id} className={styles.userRow}>
                      <div className={styles.userIdentity}>
                        <Badge tone={cu.role === 'account_owner' ? 'brand' : 'neutral'}>
                          {cu.role === 'account_owner' ? 'Primary' : 'Read-only'}
                        </Badge>
                        <span className={styles.userName}>{cu.name ?? cu.email ?? 'Unnamed user'}</span>
                        {cu.email && <span className={styles.userMeta}>{cu.email}</span>}
                      </div>
                      {cu.role !== 'account_owner' && (
                        <AdminRowMenu
                          label="Manage"
                          ariaLabel={`More customer access actions for ${cu.name ?? cu.email ?? 'user'}`}
                          align="end"
                        >
                          <Button
                            type="button"
                            variant="danger"
                            loading={accessPending}
                            aria-label={`Remove ${cu.name ?? cu.email ?? 'user'} from customer access`}
                            onClick={() => setRemovalTarget(cu)}
                          >
                            {accessPending ? 'Removing...' : 'Remove User'}
                          </Button>
                        </AdminRowMenu>
                      )}
                      {cu.role === 'account_owner' && <Badge tone="success">Owner</Badge>}
                    </li>
                  ))}
                </ul>
              )}

              <h4 className={styles.subheading}>Add customer user</h4>
              <p className={styles.mutedText}>
                Enter the user email. Users in the customer group must be assigned to a customer.
              </p>
              {!hasAccountOwner && (
                <p className={styles.mutedText}>
                  This customer has no primary contact yet. Assign a primary contact first before adding read-only users.
                </p>
              )}
              <div className={styles.addUserForm}>
                <Field label="Role" htmlFor="newCustomerRole" className={styles.addUserField}>
                  <Select
                    id="newCustomerRole"
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as 'account_owner' | 'read_only')}
                    disabled={accessPending}
                    aria-label="Role for new customer user"
                  >
                    <option value="account_owner">Primary contact (account owner)</option>
                    <option value="read_only" disabled={!hasAccountOwner}>Read-only</option>
                  </Select>
                </Field>
                <Field label="Email" htmlFor="newCustomerEmail" className={styles.addUserField}>
                  <Input
                    id="newCustomerEmail"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    placeholder="User email"
                    disabled={accessPending}
                    type="email"
                    aria-label="Email for new customer user"
                  />
                </Field>
                <Field label="Display Name" htmlFor="newCustomerName" className={styles.addUserField}>
                  <Input
                    id="newCustomerName"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="Display name (optional)"
                    disabled={accessPending}
                    aria-label="Optional display name for new customer user"
                  />
                </Field>
                <Button
                  type="button"
                  variant="primary"
                  loading={accessPending}
                  disabled={!newUserEmail.trim()}
                  aria-label="Add customer user"
                  onClick={() => void handleAddCustomerUser()}
                >
                  {accessPending ? 'Saving...' : 'Add Customer User'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </OperatorRoute>
  );
}
