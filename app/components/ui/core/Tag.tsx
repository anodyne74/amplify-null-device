import React from 'react';
import { Icon } from './Icon';

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Filter chips: on/off state. */
  selected?: boolean;
  /** Renders a remove affordance. */
  onRemove?: (e: React.MouseEvent) => void;
}

export function Tag({ selected = false, onRemove, onClick, children, className = '', ...rest }: TagProps) {
  const cls = ['nd-tag', selected ? 'nd-tag--selected' : '', onClick ? 'nd-tag--clickable' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={cls} onClick={onClick} {...rest}>
      {children}
      {onRemove && (
        <button
          className="nd-tag__remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(e);
          }}
          aria-label="Remove"
        >
          <Icon name="x" size={13} />
        </button>
      )}
    </span>
  );
}
