import { Button } from '@/app/components/ui/core/Button';
import { Select } from '@/app/components/ui/forms/Select';
import type { Customer, CustomerUser } from '@/app/administrator/customers/types';
import styles from '../page.module.css';

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
    <div className={styles.subPanel}>
      <h4 className={styles.subPanelHeading}>Account Owner — {customer.name}</h4>
      {ownerError && <div className={styles.errorBanner} role="alert" aria-live="assertive">{ownerError}</div>}
      {ownerSuccess && <div className={styles.successBanner} role="status" aria-live="polite">{ownerSuccess}</div>}

      {existingOwner ? (
        <div>
          <p>
            <strong>Owner assigned:</strong>{' '}
            {existingOwner.name ?? '—'} ({existingOwner.email ?? existingOwner.userSub})
          </p>
          <p className={styles.mutedText}>
            To change the account owner, remove the existing CustomerUser record
            from the Users admin page, then assign a new one here.
          </p>
        </div>
      ) : (
        <div>
          <p className={styles.mutedText}>
            Select a user from the customer group to assign as account owner. The owner can
            view invoices and the customer user list.
          </p>
          {usersForCustomer.length === 0 ? (
            <p className={styles.mutedText}>No users in this customer group yet.</p>
          ) : (
            <>
              <Select
                value={ownerUserSub}
                onChange={(event) => onOwnerUserSubChange(event.target.value)}
                disabled={ownerSaving}
              >
                <option value="">— Select a user —</option>
                {usersForCustomer
                  .filter((user) => user.role !== 'account_owner')
                  .map((user) => (
                    <option key={user.userSub} value={user.userSub}>
                      {user.name || user.email || user.userSub}
                    </option>
                  ))}
              </Select>
              {ownerUserSub && (
                <div className={styles.selectionPreview}>
                  <p>
                    <strong>Selected:</strong> {ownerName || '—'}
                  </p>
                  <p className={styles.selectionPreviewSubtitle}>{ownerEmail || ownerUserSub}</p>
                </div>
              )}
              <Button
                type="button"
                variant="primary"
                loading={ownerSaving}
                disabled={!ownerUserSub.trim()}
                onClick={onAssignOwner}
              >
                {ownerSaving ? 'Assigning...' : 'Assign as Account Owner'}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
