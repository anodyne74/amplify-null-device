'use client';

import type { ReactNode } from 'react';
import HelpLink from './HelpLink';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className={styles.header}>
      <div>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{title}</h1>
          <HelpLink />
        </div>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
