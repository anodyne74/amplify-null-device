import { Badge } from '@/app/components/ui/core/Badge';
import { Checkbox } from '@/app/components/ui/forms/Checkbox';
import styles from '../page.module.css';

interface SelectedUser {
  name?: string;
  email?: string;
}

interface GroupMembershipSectionProps {
  selectedUsername: string;
  selectedUser?: SelectedUser;
  selectedCustomerId: string;
  pending: boolean;
  groups: string[];
  groupOptions: readonly string[];
  onToggleGroup: (groupName: string, checked: boolean) => void;
}

export default function GroupMembershipSection({
  selectedUsername,
  selectedUser,
  selectedCustomerId,
  pending,
  groups,
  groupOptions,
  onToggleGroup,
}: GroupMembershipSectionProps) {
  if (!selectedUsername) {
    return null;
  }

  return (
    <div>
      {selectedUser?.name && <p className={styles.mutedText}>Name: {selectedUser.name}</p>}
      {selectedUser?.email && <p className={styles.mutedText}>Email: {selectedUser.email}</p>}

      {groups.length > 0 && (
        <div className={styles.chipsRow} aria-label="Active groups">
          {groups.map((group) => (
            <Badge key={group} tone="info">
              {group}
            </Badge>
          ))}
        </div>
      )}

      <h4 className={styles.subheading}>Group Membership</h4>
      {!selectedCustomerId && (
        <p className={styles.mutedText}>
          To enable customer access, select a customer in the &quot;Customer Access&quot; section below first.
        </p>
      )}
      <div className={styles.groupsGrid}>
        {groupOptions.map((group) => {
          const checked = groups.includes(group);
          const disabled = pending || (group === 'customer' && !selectedCustomerId);

          return (
            <Checkbox
              key={group}
              checked={checked}
              disabled={disabled}
              onChange={(event) => onToggleGroup(group, event.target.checked)}
              aria-label={`${checked ? 'Remove' : 'Assign'} ${group} group for ${selectedUsername}`}
              label={group}
            />
          );
        })}
      </div>
    </div>
  );
}
