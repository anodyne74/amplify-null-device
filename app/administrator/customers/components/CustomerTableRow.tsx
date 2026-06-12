import { useState, type ReactNode } from 'react';
import type { Customer, CustomerStatus } from '@/app/administrator/customers/types';
import styles from '@/app/dashboard.module.css';

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

function getCustomerStatusChipClass(status?: CustomerStatus | null) {
  switch (String(status ?? '').toLowerCase()) {
    case 'inactive':
      return styles.statusChipMuted;
    case 'suspended':
      return styles.statusChipDanger;
    default:
      return styles.statusChipActive;
  }
}

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

  return (
    <>
      <tr>
        <td>{customer.name}</td>
        <td>{customer.companyName || '—'}</td>
        <td>{customer.email}</td>
        <td>{formattedRate}</td>
        <td>
          <div className={styles.statusCellStack}>
            <span className={`${styles.statusChip} ${getCustomerStatusChipClass(customer.status ?? 'active')}`}>
              {toTitleCase(customer.status)}
            </span>
          </div>
        </td>
        <td>
          <div className={styles.actionsRow}>
            <button
              type="button"
              className={styles.rowMenuTrigger}
              aria-expanded={actionsOpen}
              aria-controls={`customer-actions-${customer.id}`}
              aria-label={`More customer actions for ${customer.name}`}
              onClick={() => setActionsOpen((open) => !open)}
            >
              Manage
            </button>
          </div>
        </td>
      </tr>
      {actionsOpen && (
        <tr className={styles.customerActionsExpandedRow}>
          <td colSpan={6}>
            <div className={styles.customerActionsPanel} id={`customer-actions-${customer.id}`}>
              <button
                type="button"
                onClick={onToggleEdit}
                aria-label={`${isEditOpen ? 'Close edit panel for' : 'Edit'} customer ${customer.name}`}
              >
                {isEditOpen ? 'Close Edit' : 'Edit'}
              </button>
              <button
                type="button"
                onClick={onToggleOwner}
                aria-label={`${isOwnerOpen ? 'Close owner management for' : 'Manage owner for'} customer ${customer.name}`}
              >
                {isOwnerOpen ? 'Close Owner' : 'Manage Owner'}
              </button>
              <button
                type="button"
                onClick={onDelete}
                aria-label={`Delete customer ${customer.name}`}
              >
                Delete
              </button>
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
