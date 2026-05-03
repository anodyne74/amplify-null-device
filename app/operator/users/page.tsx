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
  const [groups, setGroups] = useState<string[]>([]);

  // Customer Access section state
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerUsers, setCustomerUsers] = useState<CustomerUser[]>([]);
  const [accessPending, setAccessPending] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessSuccess, setAccessSuccess] = useState<string | null>(null);
  const [newUserSub, setNewUserSub] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');

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

  const handleAddReadOnlyUser = async () => {
    if (!newUserSub.trim()) {
      setAccessError('Cognito user sub is required.');
      return;
    }
    const owner = customerUsers.find((u) => u.role === 'account_owner');
    if (!owner) {
      setAccessError('No account owner assigned for this customer yet. Assign an account owner first via the Customers page.');
      return;
    }
    setAccessPending(true);
    setAccessError(null);
    setAccessSuccess(null);

    const result = await createCustomerUser({
      customerId: selectedCustomerId,
      userSub: newUserSub.trim(),
      accountOwnerSub: owner.userSub,
      role: 'read_only',
      name: newUserName || undefined,
      email: newUserEmail || undefined,
    });

    if (result.errors && result.errors.length > 0) {
      setAccessError('Failed to add user.');
    } else {
      const updated = [...customerUsers];
      if (result.data) updated.push(result.data as CustomerUser);
      const viewerSubs = [...new Set(updated.map((u) => u.userSub))];
      await syncViewerSubsForCustomer(selectedCustomerId, viewerSubs);

      setAccessSuccess('User added and access synced to all routes and stops.');
      setNewUserSub('');
      setNewUserName('');
      setNewUserEmail('');
      await loadCustomerUsers(selectedCustomerId);
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
      await callAdminApi({ action: 'addUserToGroup', username: selectedUsername, groupName });
      await loadGroups(selectedUsername);
      setSuccessMessage(
        `Assigned ${groupName} to ${selectedUsername}. The user should sign out and sign back in to refresh permissions.`
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
        `Removed ${groupName} from ${selectedUsername}. The user should sign out and sign back in to refresh permissions.`
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
          <p className={styles.welcome}>Assign and revoke customer, operator, and administrator groups.</p>

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
                  value={selectedUsername}
                  onChange={(event) => setSelectedUsername(event.target.value.trim())}
                  placeholder="Enter Cognito username"
                  disabled={pending}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (selectedUsername) {
                      void loadGroups(selectedUsername);
                    }
                  }}
                  disabled={pending || !selectedUsername}
                >
                  Load Groups
                </button>
              </>
            ) : (
              <>
                <select
                  id="userSelect"
                  value={selectedUsername}
                  onChange={(event) => setSelectedUsername(event.target.value)}
                  disabled={loading || pending}
                >
                  {users.map((user) => (
                    <option key={user.username} value={user.username}>
                      {user.firstName ? `${user.firstName} - ` : ''}
                      {user.username}
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
            Assign read-only users to a customer. Read-only users can view routes and stops but cannot
            access invoices. The account owner is assigned via the Customers page.
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
                      {cu.name ?? cu.userSub}
                      {cu.email ? ` (${cu.email})` : ''}
                      {' — '}
                      <code>{cu.userSub}</code>
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

              <h4>Add read-only user</h4>
              <p className={styles.welcome}>
                Enter the user&apos;s Cognito sub (UUID). An account owner must already be assigned before adding read-only users.
              </p>
              <input
                value={newUserSub}
                onChange={(e) => setNewUserSub(e.target.value)}
                placeholder="Cognito user sub (UUID)"
                disabled={accessPending}
              />
              <input
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="Display name (optional)"
                disabled={accessPending}
              />
              <input
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="Email (optional)"
                type="email"
                disabled={accessPending}
              />
              <button
                type="button"
                onClick={() => void handleAddReadOnlyUser()}
                disabled={accessPending || !newUserSub.trim()}
              >
                {accessPending ? 'Saving...' : 'Add Read-Only User'}
              </button>
            </div>
          )}
        </div>
      </div>
    </OperatorRoute>
  );
}
