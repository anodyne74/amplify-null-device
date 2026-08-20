import React from 'react';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right side of the header — usually an IconButton or ghost Button. */
  action?: React.ReactNode;
  footer?: React.ReactNode;
  elevation?: 'none' | 'sm' | 'md';
  /** Adds hover lift + pointer; use when the whole card navigates. */
  interactive?: boolean;
  /** Set false to bleed content (tables, charts) to the card edge. */
  padded?: boolean;
}

export function Card({
  title,
  subtitle,
  action,
  footer,
  elevation = 'sm',
  interactive = false,
  padded = true,
  children,
  className = '',
  ...rest
}: CardProps) {
  const cls = [
    'nd-card',
    elevation === 'none' ? 'nd-card--flat' : elevation === 'md' ? 'nd-card--raised' : '',
    interactive ? 'nd-card--interactive' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} {...rest}>
      {(title || action) && (
        <div className="nd-card__header">
          <div>
            {title && <div className="nd-card__title">{title}</div>}
            {subtitle && <div className="nd-card__subtitle">{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      {padded ? <div className="nd-card__body">{children}</div> : children}
      {footer && <div className="nd-card__footer">{footer}</div>}
    </div>
  );
}
