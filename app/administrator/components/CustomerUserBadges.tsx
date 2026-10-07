import { Badge } from '@/app/components/ui/core/Badge';
import type { CustomerInviteStatus } from '@/lib/customerInvite';

export function CustomerUserRoleBadge({ role }: { role: 'account_owner' | 'read_only' }) {
  return (
    <Badge tone={role === 'account_owner' ? 'success' : 'info'}>
      {role === 'account_owner' ? 'account owner' : 'read only'}
    </Badge>
  );
}

/** null: the sign-in status couldn't be read. */
export function CustomerUserStatusBadge({ status }: { status: CustomerInviteStatus | null }) {
  return <Badge tone={status === 'Invite sent' ? 'warning' : 'neutral'}>{status?.toLowerCase() ?? 'unknown'}</Badge>;
}
