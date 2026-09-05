import { Avatar } from '@/app/components/ui/core/Avatar';
import { Badge } from '@/app/components/ui/core/Badge';
import { Button } from '@/app/components/ui/core/Button';
import { formatRelativeDay } from '@/lib/format';
import styles from '../page.module.css';

export type CustomerUserRowStatus = 'Active' | 'Invite sent';

export interface CustomerUserRowData {
  id: string;
  name: string;
  email: string;
  customerName: string;
  role: 'account_owner' | 'read_only';
  status: CustomerUserRowStatus;
  lastSeen?: string | null;
}

interface CustomerUserTableRowProps {
  row: CustomerUserRowData;
  resending: boolean;
  onChangeRole: () => void;
  onResend: () => void;
  onRevoke: () => void;
}

export default function CustomerUserTableRow({
  row,
  resending,
  onChangeRole,
  onResend,
  onRevoke,
}: CustomerUserTableRowProps) {
  const isActive = row.status === 'Active';

  return (
    <tr>
      <td>
        <div className={styles.userIdentity}>
          <Avatar name={row.name} size="sm" />
          <div>
            <div className={styles.userName}>{row.name}</div>
            <div className={styles.userMeta}>{row.email}</div>
          </div>
        </div>
      </td>
      <td>{row.customerName}</td>
      <td>
        <Badge tone={row.role === 'account_owner' ? 'success' : 'info'}>
          {row.role === 'account_owner' ? 'account owner' : 'read only'}
        </Badge>
      </td>
      <td>
        <Badge tone={isActive ? 'neutral' : 'warning'}>{row.status.toLowerCase()}</Badge>
      </td>
      <td className={styles.mono}>{formatRelativeDay(row.lastSeen)}</td>
      <td className={styles.manageCell}>
        {isActive ? (
          <Button type="button" variant="secondary" size="sm" onClick={onChangeRole} aria-label={`Change role for ${row.name}`}>
            Change role
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={resending}
            disabled={resending}
            onClick={onResend}
            aria-label={`Resend invite to ${row.name}`}
          >
            {resending ? 'Resending...' : 'Resend'}
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onRevoke} aria-label={`Revoke access for ${row.name}`}>
          Revoke
        </Button>
      </td>
    </tr>
  );
}
