import React from 'react';
import { Icon } from '../core/Icon';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  /** Secondary line under the label. */
  description?: React.ReactNode;
}

export function Checkbox({ checked, defaultChecked, onChange, label, description, disabled = false, className = '', ...rest }: CheckboxProps) {
  const [inner, setInner] = React.useState(!!defaultChecked);
  const on = checked !== undefined ? checked : inner;

  return (
    <label className={`nd-choice ${disabled ? 'nd-choice--disabled' : ''} ${className}`}>
      <input
        type="checkbox"
        checked={on}
        disabled={disabled}
        onChange={(e) => {
          if (checked === undefined) setInner(e.target.checked);
          onChange?.(e);
        }}
        {...rest}
      />
      <span className={`nd-choice__box nd-choice__box--check ${on ? 'nd-choice__box--on' : ''}`}>
        <Icon name="check" size={13} />
      </span>
      {(label || description) && (
        <span className="nd-choice__text">
          {label}
          {description && <span className="nd-choice__desc">{description}</span>}
        </span>
      )}
    </label>
  );
}
