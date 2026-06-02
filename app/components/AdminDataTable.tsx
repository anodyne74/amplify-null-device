import type { ReactNode } from 'react';
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