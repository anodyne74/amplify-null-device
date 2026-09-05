import { Badge, type BadgeProps } from '@/app/components/ui/core/Badge';
import { Button } from '@/app/components/ui/core/Button';
import type { Customer } from '@/app/administrator/customers/types';
import styles from '../page.module.css';

interface CustomerTableRowProps {
  customer: Customer;
  userCount: number;
  isSelected: boolean;
  onConfigure: () => void;
  onPaymentDetails: () => void;
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
  userCount,
  isSelected,
  onConfigure,
  onPaymentDetails,
}: CustomerTableRowProps) {
  const statusKey = String(customer.status ?? 'active').toLowerCase();

  return (
    <tr className={isSelected ? styles.selectedRow : undefined}>
      <td>
        <div>{customer.name}</div>
        {customer.companyName && <div className={styles.mutedText}>{customer.companyName}</div>}
      </td>
      <td>
        <Badge tone={STATUS_TONE[statusKey] ?? 'success'} dot>
          {toTitleCase(customer.status)}
        </Badge>
      </td>
      <td>{userCount}</td>
      <td>{typeof customer.billingRatePerHour === 'number' ? `$${customer.billingRatePerHour.toFixed(2)}/hr` : '—'}</td>
      <td>{typeof customer.driverSplitPercent === 'number' ? `${customer.driverSplitPercent}%` : '—'}</td>
      <td>{customer.billingCycle ? toTitleCase(customer.billingCycle) : '—'}</td>
      <td>{typeof customer.defaultNumberOfSigns === 'number' ? customer.defaultNumberOfSigns : '—'}</td>
      <td className={styles.manageCell}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-expanded={isSelected}
          onClick={onConfigure}
          aria-label={`${isSelected ? 'Close configure panel for' : 'Configure'} customer ${customer.name}`}
        >
          {isSelected ? 'Close' : 'Configure'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onPaymentDetails} aria-label={`Payment details for ${customer.name}`}>
          Payment details
        </Button>
      </td>
    </tr>
  );
}
