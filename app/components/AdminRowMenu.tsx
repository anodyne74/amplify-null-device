'use client';

import { useId, useState, type ReactNode } from 'react';
import styles from '@/app/dashboard.module.css';

interface AdminRowMenuProps {
  ariaLabel: string;
  children: ReactNode;
  label?: string;
  align?: 'start' | 'end';
}

function mergeClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export default function AdminRowMenu({
  ariaLabel,
  children,
  label = 'More',
  align = 'start',
}: AdminRowMenuProps) {
  const menuId = useId();
  const [open, setOpen] = useState(false);

  return (
    <div
      className={mergeClasses(styles.rowMenu, align === 'end' ? styles.rowMenuAlignEnd : undefined)}
      data-open={open ? 'true' : undefined}
    >
      <button
        type="button"
        className={styles.rowMenuTrigger}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
      </button>
      {open && (
        <div className={styles.rowMenuList} id={menuId}>
          {children}
        </div>
      )}
    </div>
  );
}
