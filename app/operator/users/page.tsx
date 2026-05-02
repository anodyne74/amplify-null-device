'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import OperatorRoute from '@/app/components/OperatorRoute';
import styles from '@/app/dashboard.module.css';

type CognitoUser = {
  username?: string;
  enabled?: boolean;
  status?: string;
};

const GROUPS = ['customer', 'operator', 'administrator'] as const;

export default function UsersAdminPage() {
  const [users, setUsers] = useState<CognitoUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedUsername, setSelectedUsername] = useState<string>('');
  const [groups, setGroups] = useState<string[]>([]);

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
    try {
      const payload = await callAdminApi({ action: 'listUsers' });
      const fetchedUsers = (payload.users as CognitoUser[]) || [];
      setUsers(fetchedUsers);

      if (fetchedUsers.length > 0 && !selectedUsername && fetchedUsers[0].username) {
        setSelectedUsername(fetchedUsers[0].username);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users.');
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
            <select
              id="userSelect"
              value={selectedUsername}
              onChange={(event) => setSelectedUsername(event.target.value)}
              disabled={loading || pending}
            >
              {users.map((user) => (
                <option key={user.username} value={user.username}>
                  {user.username} ({user.status || 'UNKNOWN'})
                </option>
              ))}
            </select>
            <button type="button" onClick={() => void loadUsers()} disabled={loading || pending}>
              Refresh Users
            </button>
          </div>

          {selectedUsername && (
            <div>
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
      </div>
    </OperatorRoute>
  );
}
