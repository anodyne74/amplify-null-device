import React from 'react';
import { Icon } from '../core/Icon';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Lucide icon rendered inside the left edge (search, map-pin, mail…). */
  iconLeft?: string;
  iconRight?: string;
  invalid?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Renders a textarea instead. */
  multiline?: boolean;
}

export function Input({ iconLeft, iconRight, invalid = false, size = 'md', multiline = false, className = '', ...rest }: InputProps) {
  const cls = [
    'nd-input',
    invalid ? 'nd-input--invalid' : '',
    size !== 'md' ? `nd-input--${size}` : '',
    multiline ? 'nd-input--textarea' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (multiline) {
    // `rest` is typed for <input>; multiline renders a <textarea> instead, matching
    // the source design system's contract (a single loosely-typed component for both).
    return <textarea className={cls} {...(rest as unknown as React.TextareaHTMLAttributes<HTMLTextAreaElement>)} />;
  }

  const wrap = ['nd-inputwrap', iconLeft ? 'nd-inputwrap--has-left' : '', iconRight ? 'nd-inputwrap--has-right' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <span className={wrap}>
      {iconLeft && (
        <span className="nd-inputwrap__affix nd-inputwrap__affix--left">
          <Icon name={iconLeft} size={16} />
        </span>
      )}
      <input className={cls} aria-invalid={invalid || undefined} {...rest} />
      {iconRight && (
        <span className="nd-inputwrap__affix nd-inputwrap__affix--right">
          <Icon name={iconRight} size={16} />
        </span>
      )}
    </span>
  );
}
