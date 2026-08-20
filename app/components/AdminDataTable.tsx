'use client';

import { useCallback, useState, type ReactNode } from 'react';
import styles from '@/app/dashboard.module.css';

interface AdminDataTableProps {
  children: ReactNode;
  hint?: string;
  ariaLabel?: string;
  wrapClassName?: string;
  tableClassName?: string;
}

function mergeClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export default function AdminDataTable({
  children,
  hint,
  ariaLabel,
  wrapClassName,
  tableClassName,
}: AdminDataTableProps) {
  return (
    <>
      {hint && <p className={styles.tableScrollHint}>{hint}</p>}
      <div className={mergeClasses(styles.tableScrollWrap, wrapClassName)}>
        <table className={tableClassName ?? styles.adminTable} aria-label={ariaLabel}>
          {children}
        </table>
      </div>
    </>
  );
}

export type SortDirection = 'asc' | 'desc';

/**
 * Sort state for an AdminDataTable. `sortBy === null` keeps the caller's
 * default row order. Clicking a column cycles asc → desc → default order.
 */
export function useAdminTableSort<K extends string>() {
  const [sort, setSort] = useState<{ by: K; direction: SortDirection } | null>(null);

  const toggleSort = useCallback((key: K) => {
    setSort((prev) => {
      if (!prev || prev.by !== key) return { by: key, direction: 'asc' };
      if (prev.direction === 'asc') return { by: key, direction: 'desc' };
      return null;
    });
  }, []);

  return {
    sortBy: sort?.by ?? null,
    sortDirection: sort?.direction ?? ('asc' as SortDirection),
    toggleSort,
  };
}

interface AdminSortableHeaderProps<K extends string> {
  label: string;
  sortKey: K;
  sortBy: K | null;
  sortDirection: SortDirection;
  onSort: (key: K) => void;
  className?: string;
}

/**
 * A sortable `<th>` for use inside AdminDataTable. Renders a real button
 * and reflects the active sort via aria-sort on the th.
 */
export function AdminSortableHeader<K extends string>({
  label,
  sortKey,
  sortBy,
  sortDirection,
  onSort,
  className,
}: AdminSortableHeaderProps<K>) {
  const active = sortBy === sortKey;
  const ariaSort = active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none';

  return (
    <th scope="col" aria-sort={ariaSort} className={className}>
      <button
        type="button"
        className={styles.sortHeaderButton}
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label}`}
      >
        <span>{label}</span>
        <span className={styles.sortIndicator} aria-hidden="true">
          {active ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}
