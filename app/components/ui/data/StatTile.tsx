import React from 'react';
import { Icon } from '../core/Icon';

export interface StatTileProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Uppercase micro-label, 1-3 words. */
  label: string;
  value: React.ReactNode;
  /** e.g. "12%" — sign is conveyed by direction, not text. */
  delta?: string;
  /** up is not always good: colour is tied to direction, so pass the semantically correct one. */
  direction?: 'up' | 'down' | 'flat';
  caption?: string;
  icon?: string;
}

export function StatTile({ label, value, delta, direction = 'flat', caption, icon, className = '', ...rest }: StatTileProps) {
  return (
    <div className={`nd-stat ${className}`} {...rest}>
      <div className="nd-stat__row">
        <span className="nd-stat__label">{label}</span>
        {icon && (
          <span style={{ color: 'var(--text-subtle)' }}>
            <Icon name={icon} size={16} />
          </span>
        )}
      </div>
      <div className="nd-stat__row">
        <span className="nd-stat__value">{value}</span>
        {delta && (
          <span className={`nd-stat__delta nd-stat__delta--${direction}`}>
            <Icon name={direction === 'up' ? 'trending-up' : direction === 'down' ? 'trending-down' : 'minus'} size={15} />
            {delta}
          </span>
        )}
      </div>
      {caption && <span className="nd-stat__caption">{caption}</span>}
    </div>
  );
}
