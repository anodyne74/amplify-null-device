import { useState, type ReactNode } from 'react';
import { Badge, type BadgeProps } from '@/app/components/ui/core/Badge';
import { Button } from '@/app/components/ui/core/Button';
import type { Customer } from '@/app/administrator/customers/types';
import styles from '../page.module.css';

interface CustomerTableRowProps {
  customer: Customer;
  formattedRate: string;
  isEditOpen: boolean;
  isOwnerOpen: boolean;
  onToggleEdit: () => void;
  onToggleOwner: () => void;
  onDelete: () => void;
  editPanel?: ReactNode;
  ownerPanel?: ReactNode;
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
  formattedRate,
  isEditOpen,
  isOwnerOpen,
  onToggleEdit,
  onToggleOwner,
  onDelete,
  editPanel,
  ownerPanel,
}: CustomerTableRowProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const statusKey = String(customer.status ?? 'active').toLowerCase();

  return (
    <>
      <tr>
        <td>{customer.name}</td>
        <td>{customer.companyName || '—'}</td>
        <td>{customer.email}</td>
        <td>{formattedRate}</td>
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
            aria-expanded={actionsOpen}
            aria-controls={`customer-actions-${customer.id}`}
            aria-label={`More customer actions for ${customer.name}`}
            onClick={() => setActionsOpen((open) => !open)}
          >
            Manage
          </Button>
        </td>
      </tr>
      {actionsOpen && (
        <tr className={styles.expandedRow}>
          <td colSpan={6}>
            <div className={styles.expandedPanel} id={`customer-actions-${customer.id}`}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onToggleEdit}
                aria-label={`${isEditOpen ? 'Close edit panel for' : 'Edit'} customer ${customer.name}`}
              >
                {isEditOpen ? 'Close Edit' : 'Edit'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onToggleOwner}
                aria-label={`${isOwnerOpen ? 'Close owner management for' : 'Manage owner for'} customer ${customer.name}`}
              >
                {isOwnerOpen ? 'Close Owner' : 'Manage Owner'}
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={onDelete}
                aria-label={`Delete customer ${customer.name}`}
              >
                Delete
              </Button>
            </div>
          </td>
        </tr>
      )}
      {isEditOpen && (
        <tr>
          <td colSpan={6}>{editPanel}</td>
        </tr>
      )}
      {isOwnerOpen && (
        <tr>
          <td colSpan={6}>{ownerPanel}</td>
        </tr>
      )}
    </>
  );
}
