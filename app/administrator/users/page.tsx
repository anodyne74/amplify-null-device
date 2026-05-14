'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import OperatorRoute from '@/app/components/OperatorRoute';
import {
  createCustomerUser,
  deleteCustomerUser,
  listCustomerUsers,
  listCustomers,
  syncViewerSubsForCustomer,
} from '@/lib/queries';
import styles from '@/app/dashboard.module.css';

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

  // ── Customer Access ──────────────────────────────────────────────
  const loadCustomers = useCallback(async () => {
    const result = await listCustomers({ limit: 100 });
    if (!result.errors || result.errors.length === 0) {
      setCustomers((result.data as CustomerSummary[]) ?? []);
      if (result.data && result.data.length > 0 && !selectedCustomerId) {
        setSelectedCustomerId((result.data[0] as CustomerSummary).id);
      }
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
      }

      const updated = [...customerUsers];
      if (!existing) {
        updated.push({
          id: 'temp',
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
      await loadCustomerUsers(selectedCustomerId);
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
      await loadCustomerUsers(selectedCustomerId);
    }
    setAccessPending(false);
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
                  id: 'temp',
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
          await loadCustomerUsers(selectedCustomerId);
        }
      }

      await loadGroups(selectedUsername);
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
      await loadGroups(selectedUsername);
      setSuccessMessage(
        `Removed ${groupName} from ${selectedEmailInput || selectedUsername}. The user should sign out and sign back in to refresh permissions.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove group.');
    }
    setPending(false);
  };

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.page}>
        <h1 className={styles.heading}>Users</h1>
        <div className={styles.infoPanel}>
          <h3>Manage User Groups</h3>
          <p className={styles.welcome}>Assign and revoke customer, operator, and administrator groups by user email.</p>
          <p className={styles.welcome}>Users must sign up via Request Access and set their own password during sign-up.</p>

          {error && <p className={styles.welcome}>{error}</p>}
          {successMessage && <p className={styles.welcome}>{successMessage}</p>}

          <div>
            <label htmlFor="userSelect">User</label>
            <br />
            {listUsersDenied ? (
              <>
                <input
                  id="userSelect"
                  type="text"
                  value={selectedEmailInput}
                  onChange={(event) => setSelectedEmailInput(event.target.value.trim())}
                  placeholder="Enter user email"
                  disabled={pending}
                />
                <button
                  type="button"
                  onClick={async () => {
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
                  }}
                  disabled={pending || !selectedEmailInput}
                >
                  Load Groups
                </button>
              </>
            ) : (
              <>
                <select
                  id="userSelect"
                  value={selectedUsername}
                  onChange={(event) => {
                    const username = event.target.value;
                    setSelectedUsername(username);
                    const selected = users.find((u) => u.username === username);
                    setSelectedEmailInput(selected?.email || selected?.username || '');
                  }}
                  disabled={loading || pending}
                >
                  {users.map((user) => (
                    <option key={user.username} value={user.username}>
                      {user.name || user.username || 'Unnamed user'}
                      {user.email ? ` (${user.email})` : ''}
                      {user.status ? ` (${user.status})` : ''}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => void loadUsers()} disabled={loading || pending}>
                  Refresh Users
                </button>
              </>
            )}
          </div>

          {selectedUsername && (
            <div>
              {users.find((u) => u.username === selectedUsername)?.name && (
                <p className={styles.welcome}>
                  Name: {users.find((u) => u.username === selectedUsername)?.name}
                </p>
              )}

              {users.find((u) => u.username === selectedUsername)?.email && (
                <p className={styles.welcome}>
                  Email: {users.find((u) => u.username === selectedUsername)?.email}
                </p>
              )}

              <h4>Group Membership</h4>
              {!selectedCustomerId && (
                <p className={styles.welcome} style={{ color: 'var(--nd-text-muted)', fontSize: '0.9rem' }}>
                  To enable customer access, select a customer in the "Customer Access" section below first.
                </p>
              )}
              <div style={{ display: 'grid', gap: 10 }}>
                {GROUPS.map((group) => {
                  const checked = groups.includes(group);
                  const disabled = pending || (group === 'customer' && !selectedCustomerId);
                  return (
                    <label
                      key={group}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        opacity: disabled ? 0.65 : 1,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={(event) => {
                          if (event.target.checked) {
                            void assignGroup(group);
                            return;
                          }
                          void removeGroup(group);
                        }}
                      />
                      <span style={{ textTransform: 'capitalize' }}>{group}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Customer Access ── */}
        <div className={styles.infoPanel}>
          <h3>Customer Access</h3>
          <p className={styles.welcome}>
            Customer-group users must be assigned to a customer. Assign each user by email as either
            primary contact (account owner) or read-only.
          </p>

          {accessError && <p className={styles.welcome}>{accessError}</p>}
          {accessSuccess && <p className={styles.welcome}>{accessSuccess}</p>}

          <div>
            <label htmlFor="customerSelect">Customer</label>
            <br />
            <select
              id="customerSelect"
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              disabled={accessPending}
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {selectedCustomerId && (
            <div>
              <h4>Users for this customer</h4>
              {customerUsers.length === 0 ? (
                <p className={styles.welcome}>No users assigned yet.</p>
              ) : (
                <ul>
                  {customerUsers.map((cu) => (
                    <li key={cu.id}>
                      <strong>{cu.role === 'account_owner' ? 'Owner' : 'Read-only'}:</strong>{' '}
                      {cu.name ?? cu.email ?? 'Unnamed user'}
                      {cu.email ? ` (${cu.email})` : ''}
                      {cu.role !== 'account_owner' && (
                        <>
                          {' '}
                          <button
                            type="button"
                            onClick={() => void handleRemoveCustomerUser(cu.id)}
                            disabled={accessPending}
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <h4>Add customer user</h4>
              <p className={styles.welcome}>
                Enter the user email. Users in the customer group must be assigned to a customer.
              </p>
              {!hasAccountOwner && (
                <p className={styles.welcome}>
                  This customer has no primary contact yet. Assign a primary contact first before adding read-only users.
                </p>
              )}
              <select
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value as 'account_owner' | 'read_only')}
                disabled={accessPending}
              >
                <option value="account_owner">Primary contact (account owner)</option>
                <option value="read_only" disabled={!hasAccountOwner}>Read-only</option>
              </select>
              <input
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="User email"
                disabled={accessPending}
                type="email"
              />
              <input
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="Display name (optional)"
                disabled={accessPending}
              />
              <button
                type="button"
                onClick={() => void handleAddCustomerUser()}
                disabled={accessPending || !newUserEmail.trim()}
              >
                {accessPending ? 'Saving...' : 'Add Customer User'}
              </button>
            </div>
          )}
        </div>
      </div>
    </OperatorRoute>
  );
}
