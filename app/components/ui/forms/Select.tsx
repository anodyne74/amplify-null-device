import React from 'react';
import { Icon } from '../core/Icon';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** Strings or {value,label} pairs. Ignored if children are supplied. */
  options?: Array<string | SelectOption>;
  invalid?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function Select({ options = [], invalid = false, size = 'md', className = '', children, ...rest }: SelectProps) {
  const cls = ['nd-input', 'nd-select', invalid ? 'nd-input--invalid' : '', size !== 'md' ? `nd-input--${size}` : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <span className="nd-selectwrap">
      <select className={cls} {...rest}>
        {children ||
          options.map((o) => {
            const v = typeof o === 'string' ? o : o.value;
            const l = typeof o === 'string' ? o : o.label;
            return (
              <option key={v} value={v}>
                {l}
              </option>
            );
          })}
      </select>
      <span className="nd-selectwrap__chevron">
        <Icon name="chevron-down" size={16} />
      </span>
    </span>
  );
}
