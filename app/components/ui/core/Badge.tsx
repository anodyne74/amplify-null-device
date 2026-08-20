import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';
  size?: 'sm' | 'md';
  /** Leading status dot — used for job and invoice states. */
  dot?: boolean;
}

export function Badge({ tone = 'neutral', size = 'md', dot = false, children, className = '', ...rest }: BadgeProps) {
  const cls = ['nd-badge', `nd-badge--${tone}`, size === 'sm' ? 'nd-badge--sm' : '', className].filter(Boolean).join(' ');
  return (
    <span className={cls} {...rest}>
      {dot && <span className="nd-badge__dot" />}
      {children}
    </span>
  );
}
