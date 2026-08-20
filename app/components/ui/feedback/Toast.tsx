import React from 'react';
import { Icon } from '../core/Icon';
import { IconButton } from '../core/IconButton';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

const MAP: Record<ToastTone, [string, string, string]> = {
  success: ['check', 'var(--status-success-bg)', 'var(--status-success-fg)'],
  error: ['triangle-alert', 'var(--status-danger-bg)', 'var(--status-danger-fg)'],
  info: ['info', 'var(--status-info-bg)', 'var(--status-info-fg)'],
  warning: ['triangle-alert', 'var(--status-warning-bg)', 'var(--status-warning-fg)'],
};

export interface ToastProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: ToastTone;
  title: React.ReactNode;
  description?: React.ReactNode;
  onDismiss?: () => void;
  /** Optional single ghost Button, e.g. "Undo". */
  action?: React.ReactNode;
}

export function Toast({ tone = 'success', title, description, onDismiss, action, className = '', ...rest }: ToastProps) {
  const [icon, bg, fg] = MAP[tone] || MAP.info;

  return (
    <div className={`nd-toast ${className}`} role="status" {...rest}>
      <span className="nd-toast__icon" style={{ background: bg, color: fg }}>
        <Icon name={icon} size={16} />
      </span>
      <div style={{ flex: 1 }}>
        <div className="nd-toast__title">{title}</div>
        {description && <div className="nd-toast__desc">{description}</div>}
        {action && <div style={{ marginTop: 'var(--space-4)' }}>{action}</div>}
      </div>
      {onDismiss && <IconButton icon="x" label="Dismiss" size="sm" onClick={onDismiss} />}
    </div>
  );
}
