import type { ReactNode } from 'react';
import styles from '@/app/dashboard.module.css';

interface AdminSectionHeaderProps {
  title: string;
  titleClassName?: string;
  description?: string;
  secondaryDescription?: string;
  actions?: ReactNode;
}

export default function AdminSectionHeader({
  title,
  titleClassName,
  description,
  secondaryDescription,
  actions,
}: AdminSectionHeaderProps) {
  return (
    <div className={styles.inlineGrid}>
      <div className={styles.sectionHeaderRow}>
        <h3 className={titleClassName}>{title}</h3>
        {actions}
      </div>
      {description && <p className={styles.welcome}>{description}</p>}
      {secondaryDescription && <p className={styles.welcome}>{secondaryDescription}</p>}
    </div>
  );
}