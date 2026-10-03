import React from 'react';
import { Icon } from './Icon';

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Filter chips: on/off state. */
  selected?: boolean;
  /** Renders a remove affordance. */
  onRemove?: (e: React.MouseEvent) => void;
}

export function Tag({ selected = false, onRemove, onClick, onKeyDown, children, className = '', ...rest }: TagProps) {
  const cls = ['nd-tag', selected ? 'nd-tag--selected' : '', onClick ? 'nd-tag--clickable' : '', className]
    .filter(Boolean)
    .join(' ');

  // A clickable Tag is a filter chip: a toggle button that keyboard users and
  // screen readers can reach.
  const toggle = onClick ? { role: 'button', tabIndex: 0, 'aria-pressed': selected } : {};

  const handleKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    onKeyDown?.(e);
    // Enter and Space press it, as they would a button; Space mustn't scroll the page.
    if (onClick && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      e.currentTarget.click();
    }
  };

  return (
    <span className={cls} onClick={onClick} onKeyDown={handleKeyDown} {...toggle} {...rest}>
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
