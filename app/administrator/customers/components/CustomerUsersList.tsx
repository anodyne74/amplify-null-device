import { useState } from 'react';
import { Badge } from '@/app/components/ui/core/Badge';
import { Button } from '@/app/components/ui/core/Button';
import { resendCustomerInvite, type CustomerInviteStatus } from '@/lib/customerInvite';
import styles from '../page.module.css';

export interface CustomerUsersListRow {
  id: string;
  name: string;
  email: string;
  role: 'account_owner' | 'read_only';
  /** null when sign-in statuses couldn't be read. */
  status: CustomerInviteStatus | null;
}

interface CustomerUsersListProps {
  customerName: string;
  users: CustomerUsersListRow[];
}

// Changing, revoking and inviting Customer Users stays on the Users screen;
// this list only resends invites (#502).
export default function CustomerUsersList({ customerName, users }: CustomerUsersListProps) {
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ ok: boolean; message: string } | null>(null);

  const handleResend = async (row: CustomerUsersListRow) => {
    setResendingId(row.id);
    setOutcome(null);
    setOutcome(await resendCustomerInvite({ email: row.email, name: row.name }, customerName));
    setResendingId(null);
  };

  return (
    <>
      <h4 className={styles.subPanelHeading}>Customer Users</h4>
      {outcome &&
        (outcome.ok ? (
          <div className={styles.successBanner} role="status" aria-live="polite">{outcome.message}</div>
        ) : (
          <div className={styles.errorBanner} role="alert" aria-live="assertive">{outcome.message}</div>
        ))}
      {users.length === 0 ? (
        <p className={styles.mutedText}>No Customer Users yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className="nd-table" aria-label="Customer Users">
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((row) => {
                const resending = resendingId === row.id;
                return (
                  <tr key={row.id}>
                    <td>
                      <div>{row.name}</div>
                      <div className={styles.mutedText}>{row.email}</div>
                    </td>
                    <td>
                      <Badge tone={row.role === 'account_owner' ? 'success' : 'info'}>
                        {row.role === 'account_owner' ? 'account owner' : 'read only'}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={row.status === 'Invite sent' ? 'warning' : 'neutral'}>
                        {row.status?.toLowerCase() ?? 'unknown'}
                      </Badge>
                    </td>
                    <td className={styles.manageCell}>
                      {row.status === 'Invite sent' && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          loading={resending}
                          disabled={resendingId !== null}
                          onClick={() => void handleResend(row)}
                          aria-label={`Resend invite to ${row.name}`}
                        >
                          {resending ? 'Resending...' : 'Resend invite'}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
