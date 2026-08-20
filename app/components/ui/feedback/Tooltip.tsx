import React from 'react';

export interface TooltipProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Plain text, no punctuation, under 8 words. */
  label: React.ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactNode;
}

export function Tooltip({ label, placement = 'top', children, className = '', ...rest }: TooltipProps) {
  const [on, setOn] = React.useState(false);

  return (
    <span
      className={`nd-tooltip ${className}`}
      onMouseEnter={() => setOn(true)}
      onMouseLeave={() => setOn(false)}
      onFocus={() => setOn(true)}
      onBlur={() => setOn(false)}
      {...rest}
    >
      {children}
      {on && (
        <span className={`nd-tooltip__bubble nd-tooltip__bubble--${placement}`} role="tooltip">
          {label}
        </span>
      )}
    </span>
  );
}
