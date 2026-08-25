'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/app/components/ui/core/Icon';
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

const FOCUSABLE_SELECTOR = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export default function AdminRowMenu({
  ariaLabel,
  children,
  label = 'More',
  align = 'start',
}: AdminRowMenuProps) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const getMenuItems = useCallback(() => {
    return Array.from(
      listRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []
    );
  }, []);

  const closeMenu = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  // Move focus into the menu when it opens.
  useEffect(() => {
    if (!open) return;
    getMenuItems()[0]?.focus();
  }, [open, getMenuItems]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [open]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;

    if (event.key === 'Escape') {
      event.stopPropagation();
      closeMenu(true);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = getMenuItems();
      if (items.length === 0) return;

      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex =
        currentIndex === -1
          ? (event.key === 'ArrowDown' ? 0 : items.length - 1)
          : (currentIndex + delta + items.length) % items.length;
      items[nextIndex]?.focus();
    }
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div
      ref={rootRef}
      className={mergeClasses(styles.rowMenu, align === 'end' ? styles.rowMenuAlignEnd : undefined)}
      data-open={open ? 'true' : undefined}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.rowMenuTrigger}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
      >
        {label}
        <Icon name="chevron-down" size={14} className={styles.rowMenuChevron} />
      </button>
      {open && (
        <div
          ref={listRef}
          className={styles.rowMenuList}
          id={menuId}
          role="menu"
          aria-label={ariaLabel}
        >
          {children}
        </div>
      )}
    </div>
  );
}
