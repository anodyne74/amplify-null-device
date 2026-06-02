import AdminActionButton from '@/app/components/AdminActionButton';
import type { Customer, CustomerUser } from '@/app/administrator/customers/types';
import styles from '@/app/dashboard.module.css';

interface CustomerOwnerPanelProps {
  customer: Customer;
  ownerError: string | null;
  ownerSuccess: string | null;
  ownerSaving: boolean;
  ownerUserSub: string;
  ownerName: string;
  ownerEmail: string;
  usersForCustomer: CustomerUser[];
  existingOwner?: CustomerUser;
  onOwnerUserSubChange: (userSub: string) => void;
  onAssignOwner: () => void;
}

export default function CustomerOwnerPanel({
  customer,
  ownerError,
  ownerSuccess,
  ownerSaving,
  ownerUserSub,
  ownerName,
  ownerEmail,
  usersForCustomer,
  existingOwner,
  onOwnerUserSubChange,
  onAssignOwner,
}: CustomerOwnerPanelProps) {
  return (
    <div className={styles.infoPanel}>
      <h4>Account Owner — {customer.name}</h4>
      {ownerError && (
        <p className={styles.inlineErrorText} role="alert" aria-live="assertive">
          {ownerError}
        </p>
      )}
      {ownerSuccess && (
        <p className={styles.inlineSuccessText} role="status" aria-live="polite">
          {ownerSuccess}
        </p>
      )}

      {existingOwner ? (
        <div>
          <p>
            <strong>Owner assigned:</strong>{' '}
            {existingOwner.name ?? '—'} ({existingOwner.email ?? existingOwner.userSub})
          </p>
          <p className={styles.welcome}>
            To change the account owner, remove the existing CustomerUser record
            from the Users admin page, then assign a new one here.
          </p>
        </div>
      ) : (
        <div>
          <p className={styles.welcome}>
            Select a user from the customer group to assign as account owner. The owner can
            view invoices and the customer user list.
          </p>
          {usersForCustomer.length === 0 ? (
            <p className={styles.welcome}>No users in this customer group yet.</p>
          ) : (
            <>
              <select
                value={ownerUserSub}
                onChange={(event) => onOwnerUserSubChange(event.target.value)}
                disabled={ownerSaving}
                className={styles.fullWidth}
              >
                <option value="">— Select a user —</option>
                {usersForCustomer
                  .filter((user) => user.role !== 'account_owner')
                  .map((user) => (
                    <option key={user.userSub} value={user.userSub}>
                      {user.name || user.email || user.userSub}
                    </option>
                  ))}
              </select>
              {ownerUserSub && (
                <div className={styles.selectionPreview}>
                  <p className={styles.selectionPreviewTitle}>
                    <strong>Selected:</strong> {ownerName || '—'}
                  </p>
                  <p className={styles.selectionPreviewSubtitle}>{ownerEmail || ownerUserSub}</p>
                </div>
              )}
              <AdminActionButton
                onClick={onAssignOwner}
                variant="primary"
                isLoading={ownerSaving}
                loadingLabel="Assigning..."
                disabled={!ownerUserSub.trim()}
              >
                Assign as Account Owner
              </AdminActionButton>
            </>
          )}
        </div>
      )}
    </div>
  );
}