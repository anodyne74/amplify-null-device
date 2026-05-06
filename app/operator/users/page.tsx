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
  username?: string;
  sub?: string;
  enabled?: boolean;
  status?: string;
  firstName?: string;
  email?: string;
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
  const [selectedCustomerRole, setSelectedCustomerRole] = useState<'account_owner' | 'read_only'>('read_only');
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

  const availableGroups = useMemo(() => GROUPS.filter((g) => !groups.includes(g)), [groups]);

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

  const handleAddCustomerUser = async () => {
    if (!newUserEmail.trim()) {
      setAccessError('User email is required.');
      return;
    }

    const resolvedUser = await resolveUserByEmail(newUserEmail.trim()).catch(() => null);
    if (!resolvedUser?.username || !resolvedUser.sub) {
      setAccessError('Could not find a Cognito user for that email.');
      return;
    }

    const owner = customerUsers.find((u) => u.role === 'account_owner');
    if (newUserRole === 'read_only' && !owner) {
      setAccessError('No account owner assigned for this customer yet. Assign a primary contact first.');
      return;
    }
    if (newUserRole === 'account_owner' && owner && owner.userSub !== resolvedUser.sub) {
      setAccessError('This customer already has a primary contact. Remove the current owner before assigning a new one.');
      return;
    }

    setAccessPending(true);
    setAccessError(null);
    setAccessSuccess(null);

    try {
      // Ensure customer users belong to customer group.
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

      const existing = customerUsers.find((u) => u.userSub === resolvedUser.sub);
      if (!existing) {
        const result = await createCustomerUser({
          customerId: selectedCustomerId,
          userSub: resolvedUser.sub,
          accountOwnerSub: newUserRole === 'account_owner' ? resolvedUser.sub : (owner?.userSub || resolvedUser.sub),
          role: newUserRole,
          name: newUserName || resolvedUser.firstName || undefined,
          email: newUserEmail.trim().toLowerCase(),
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
          userSub: resolvedUser.sub,
          accountOwnerSub: newUserRole === 'account_owner' ? resolvedUser.sub : (owner?.userSub || resolvedUser.sub),
          role: newUserRole,
          name: newUserName || resolvedUser.firstName || undefined,
          email: newUserEmail.trim().toLowerCase(),
        });
      }
      const viewerSubs = [...new Set(updated.map((u) => u.userSub))];
      await syncViewerSubsForCustomer(selectedCustomerId, viewerSubs);

      setAccessSuccess('User assigned to customer and access synced to all routes and stops.');
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
      const viewerSubs = [...new Set(updated.map((u) => u.userSub))];
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

        const owner = customerUsers.find((u) => u.role === 'account_owner');
        if (selectedCustomerRole === 'read_only' && !owner) {
          setError('Select primary contact role first, or assign an account owner for this customer.');
          setPending(false);
          return;
        }
        if (selectedCustomerRole === 'account_owner' && owner && owner.userSub !== selectedUser.sub) {
          setError('This customer already has a primary contact. Remove the current owner first.');
          setPending(false);
          return;
        }
      }

      await callAdminApi({ action: 'addUserToGroup', username: selectedUsername, groupName });

      if (groupName === 'customer') {
        const owner = customerUsers.find((u) => u.role === 'account_owner');
        if (selectedUser?.sub) {
          const existing = customerUsers.find((u) => u.userSub === selectedUser.sub);
          if (!existing) {
            const customerUserResult = await createCustomerUser({
              customerId: selectedCustomerId,
              userSub: selectedUser.sub,
              accountOwnerSub:
                selectedCustomerRole === 'account_owner'
                  ? selectedUser.sub
                  : (owner?.userSub || selectedUser.sub),
              role: selectedCustomerRole,
              name: selectedUser.firstName || undefined,
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
                  accountOwnerSub:
                    selectedCustomerRole === 'account_owner'
                      ? selectedUser.sub
                      : (owner?.userSub || selectedUser.sub),
                  role: selectedCustomerRole,
                  name: selectedUser.firstName || undefined,
                  email: selectedUser.email || undefined,
                },
              ];
          await syncViewerSubsForCustomer(
            selectedCustomerId,
            [...new Set(updatedUsers.map((u) => u.userSub))]
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
                      {user.firstName ? `${user.firstName} - ` : ''}
                      {user.email || user.username}
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
              {users.find((u) => u.username === selectedUsername)?.email && (
                <p className={styles.welcome}>
                  Email: {users.find((u) => u.username === selectedUsername)?.email}
                </p>
              )}

              {selectedCustomerId && (
                <div>
                  <label htmlFor="customerRoleForGroup">Customer role when assigning customer group</label>
                  <br />
                  <select
                    id="customerRoleForGroup"
                    value={selectedCustomerRole}
                    onChange={(e) => setSelectedCustomerRole(e.target.value as 'account_owner' | 'read_only')}
                    disabled={pending}
                  >
                    <option value="account_owner">Primary contact (account owner)</option>
                    <option value="read_only">Read-only</option>
                  </select>
                </div>
              )}

              <h4>Current Groups</h4>
              {groups.length === 0 ? (
                <p className={styles.welcome}>No groups assigned.</p>
              ) : (
                <ul>
                  {groups.map((group) => (
                    <li key={group}>
                      {group}{' '}
                      <button
                        type="button"
                        onClick={() => {
                          void removeGroup(group as (typeof GROUPS)[number]);
                        }}
                        disabled={pending}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <h4>Available Groups</h4>
              {availableGroups.length === 0 ? (
                <p className={styles.welcome}>All supported groups already assigned.</p>
              ) : (
                <ul>
                  {availableGroups.map((group) => (
                    <li key={group}>
                      {group}{' '}
                      <button
                        type="button"
                        onClick={() => {
                          void assignGroup(group);
                        }}
                        disabled={pending}
                      >
                        Assign
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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
              <select
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value as 'account_owner' | 'read_only')}
                disabled={accessPending}
              >
                <option value="account_owner">Primary contact (account owner)</option>
                <option value="read_only">Read-only</option>
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
