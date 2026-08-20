import React from 'react';
import { IconButton } from '../core/IconButton';

export interface DialogProps {
  open: boolean;
  title: React.ReactNode;
  /** One sentence of context under the title. */
  description?: React.ReactNode;
  onClose?: () => void;
  /** Action row — secondary then primary, right aligned. */
  footer?: React.ReactNode;
  size?: 'md' | 'lg';
  children?: React.ReactNode;
}

export function Dialog({ open = false, title, description, onClose, footer, size = 'md', children }: DialogProps) {
  if (!open) return null;

  return (
    <div className="nd-dialog__scrim" onClick={onClose}>
      <div
        className={`nd-dialog ${size === 'lg' ? 'nd-dialog--lg' : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="nd-dialog__header">
          <div>
            <div className="nd-dialog__title">{title}</div>
            {description && <div className="nd-dialog__desc">{description}</div>}
          </div>
          {onClose && <IconButton icon="x" label="Close" onClick={onClose} />}
        </div>
        {children && <div className="nd-dialog__body">{children}</div>}
        {footer && <div className="nd-dialog__footer">{footer}</div>}
      </div>
    </div>
  );
}
