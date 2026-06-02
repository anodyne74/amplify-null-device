import type { ReactNode } from 'react';
import type { Customer, CustomerStatus } from '@/app/administrator/customers/types';
import styles from '@/app/dashboard.module.css';

interface CustomerTableRowProps {
  customer: Customer;
  formattedRate: string;
  isEditOpen: boolean;
  isOwnerOpen: boolean;
  onStatusChange: (status: CustomerStatus) => void;
  onToggleEdit: () => void;
  onToggleOwner: () => void;
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
  onStatusChange,
  onToggleEdit,
  onToggleOwner,
  editPanel,
  ownerPanel,
}: CustomerTableRowProps) {
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
            <select
              value={customer.status ?? 'active'}
              onChange={(event) => {
                onStatusChange(event.target.value as CustomerStatus);
              }}
              aria-label={`Status for customer ${customer.name}`}
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
              <option value="suspended">suspended</option>
            </select>
          </div>
        </td>
        <td>
          <div className={styles.actionsRow}>
            <details className={styles.rowMenu}>
              <summary className={styles.rowMenuTrigger}>Manage</summary>
              <div className={styles.rowMenuList}>
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
              </div>
            </details>
          </div>
        </td>
      </tr>
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