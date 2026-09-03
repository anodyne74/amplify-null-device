import type { ReactNode } from 'react';
import { Badge, type BadgeProps } from '@/app/components/ui/core/Badge';
import { Button } from '@/app/components/ui/core/Button';
import type { Customer } from '@/app/administrator/customers/types';
import styles from '../page.module.css';

interface CustomerTableRowProps {
  customer: Customer;
  isEditOpen: boolean;
  onToggleEdit: () => void;
  editPanel?: ReactNode;
}

function toTitleCase(value?: string | null) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return 'Active';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

const STATUS_TONE: Record<string, BadgeProps['tone']> = {
  inactive: 'neutral',
  suspended: 'danger',
  active: 'success',
};

export default function CustomerTableRow({
  customer,
  isEditOpen,
  onToggleEdit,
  editPanel,
}: CustomerTableRowProps) {
  const statusKey = String(customer.status ?? 'active').toLowerCase();

  return (
    <>
      <tr>
        <td>{customer.name}</td>
        <td>{customer.companyName || '—'}</td>
        <td>{customer.email}</td>
        <td>
          <Badge tone={STATUS_TONE[statusKey] ?? 'success'} dot>
            {toTitleCase(customer.status)}
          </Badge>
        </td>
        <td className={styles.manageCell}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-expanded={isEditOpen}
            onClick={onToggleEdit}
            aria-label={`${isEditOpen ? 'Close edit panel for' : 'Edit'} customer ${customer.name}`}
          >
            {isEditOpen ? 'Close Edit' : 'Edit'}
          </Button>
        </td>
      </tr>
      {isEditOpen && (
        <tr>
          <td colSpan={5}>{editPanel}</td>
        </tr>
      )}
    </>
  );
}
