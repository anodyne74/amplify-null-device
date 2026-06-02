import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from '@/app/dashboard.module.css';

type AdminActionButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface AdminActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  loadingLabel?: string;
  variant?: AdminActionButtonVariant;
  children: ReactNode;
}

function mergeClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function getVariantClassName(variant?: AdminActionButtonVariant) {
  if (variant === 'primary') return styles.adminBtnPrimary;
  if (variant === 'secondary') return styles.adminBtnSecondary;
  if (variant === 'ghost') return styles.adminBtnGhost;
  if (variant === 'danger') return styles.adminBtnDanger;
  return undefined;
}

export default function AdminActionButton({
  isLoading = false,
  loadingLabel,
  variant,
  disabled,
  children,
  className,
  ...buttonProps
}: AdminActionButtonProps) {
  return (
    <button
      type="button"
      className={mergeClasses(styles.adminBtn, getVariantClassName(variant), className)}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...buttonProps}
    >
      {isLoading ? (loadingLabel ?? children) : children}
    </button>
  );
}