import styles from '@/app/dashboard.module.css';
import AdminActionButton from '@/app/components/AdminActionButton';
import AdminFormField from '@/app/components/AdminFormField';

type UserOption = {
  username?: string;
  name?: string;
  email?: string;
  status?: string;
};

interface UserSelectorControlProps {
  listUsersDenied: boolean;
  selectedEmailInput: string;
  selectedUsername: string;
  users: UserOption[];
  loading: boolean;
  pending: boolean;
  onEmailInputChange: (value: string) => void;
  onLoadGroupsByEmail: () => void | Promise<void>;
  onSelectUsername: (username: string) => void;
  onRefreshUsers: () => void;
}

export default function UserSelectorControl({
  listUsersDenied,
  selectedEmailInput,
  selectedUsername,
  users,
  loading,
  pending,
  onEmailInputChange,
  onLoadGroupsByEmail,
  onSelectUsername,
  onRefreshUsers,
}: UserSelectorControlProps) {
  return (
    <AdminFormField label="User" htmlFor="userSelect" className={styles.inlineGrid}>
      {listUsersDenied ? (
        <div className={styles.actionsRow}>
          <input
            id="userSelect"
            type="text"
            value={selectedEmailInput}
            onChange={(event) => onEmailInputChange(event.target.value.trim())}
            placeholder="Enter user email"
            disabled={pending}
            aria-label="User email for loading groups"
          />
          <AdminActionButton
            onClick={() => {
              void onLoadGroupsByEmail();
            }}
            variant="secondary"
            isLoading={pending}
            loadingLabel="Loading..."
            disabled={!selectedEmailInput}
          >
            Load Groups
          </AdminActionButton>
        </div>
      ) : (
        <div className={styles.actionsRow}>
          <select
            id="userSelect"
            value={selectedUsername}
            onChange={(event) => {
              onSelectUsername(event.target.value);
            }}
            disabled={loading || pending}
            aria-label="Select user"
          >
            {users.map((user) => (
              <option key={user.username} value={user.username}>
                {user.name || user.username || 'Unnamed user'}
                {user.email ? ` (${user.email})` : ''}
                {user.status ? ` (${user.status})` : ''}
              </option>
            ))}
          </select>
          <AdminActionButton
            onClick={() => {
              onRefreshUsers();
            }}
            variant="ghost"
            isLoading={loading}
            loadingLabel="Refreshing..."
            disabled={pending}
          >
            Refresh Users
          </AdminActionButton>
        </div>
      )}
    </AdminFormField>
  );
}