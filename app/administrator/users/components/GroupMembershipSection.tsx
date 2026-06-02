import styles from '@/app/dashboard.module.css';

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
      {selectedUser?.name && <p className={styles.welcome}>Name: {selectedUser.name}</p>}

      {selectedUser?.email && <p className={styles.welcome}>Email: {selectedUser.email}</p>}

      {groups.length > 0 && (
        <div className={styles.statusChipRow} aria-label="Active groups">
          {groups.map((group) => (
            <span key={group} className={`${styles.statusChip} ${styles.statusChipSent}`}>
              {group}
            </span>
          ))}
        </div>
      )}

      <h4>Group Membership</h4>
      {!selectedCustomerId && (
        <p className={`${styles.welcome} ${styles.sectionNotice}`}>
          To enable customer access, select a customer in the "Customer Access" section below first.
        </p>
      )}
      <div className={styles.inlineGrid}>
        {groupOptions.map((group) => {
          const checked = groups.includes(group);
          const disabled = pending || (group === 'customer' && !selectedCustomerId);

          return (
            <label
              key={group}
              className={`${styles.groupLabel} ${disabled ? styles.groupLabelDisabled : styles.groupLabelEnabled}`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(event) => onToggleGroup(group, event.target.checked)}
                aria-label={`${checked ? 'Remove' : 'Assign'} ${group} group for ${selectedUsername}`}
              />
              <span className={styles.groupLabelText}>{group}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}