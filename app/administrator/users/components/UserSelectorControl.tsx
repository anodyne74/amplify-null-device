import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Select } from '@/app/components/ui/forms/Select';
import { Button } from '@/app/components/ui/core/Button';
import styles from '../page.module.css';

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
    <Field label="User" htmlFor="userSelect">
      {listUsersDenied ? (
        <div className={styles.sectionRow}>
          <Input
            id="userSelect"
            type="text"
            value={selectedEmailInput}
            onChange={(event) => onEmailInputChange(event.target.value.trim())}
            placeholder="Enter user email"
            disabled={pending}
            aria-label="User email for loading groups"
          />
          <Button
            type="button"
            variant="secondary"
            loading={pending}
            disabled={!selectedEmailInput}
            onClick={() => {
              void onLoadGroupsByEmail();
            }}
          >
            {pending ? 'Loading...' : 'Load Groups'}
          </Button>
        </div>
      ) : (
        <div className={styles.sectionRow}>
          <Select
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
          </Select>
          <Button
            type="button"
            variant="ghost"
            loading={loading}
            disabled={pending}
            onClick={() => {
              onRefreshUsers();
            }}
          >
            {loading ? 'Refreshing...' : 'Refresh Users'}
          </Button>
        </div>
      )}
    </Field>
  );
}
