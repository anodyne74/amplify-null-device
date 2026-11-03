import React from 'react';
import { Icon } from '../core/Icon';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  /** Secondary line under the label. */
  description?: React.ReactNode;
  /** Some, not all, of a group are on. Shown as a dash; the input reports `mixed` to assistive technology. */
  indeterminate?: boolean;
}

export function Checkbox({ checked, defaultChecked, onChange, label, description, indeterminate = false, disabled = false, className = '', ...rest }: CheckboxProps) {
  const [inner, setInner] = React.useState(!!defaultChecked);
  const on = checked !== undefined ? checked : inner;
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label className={`nd-choice ${disabled ? 'nd-choice--disabled' : ''} ${className}`}>
      <input
        ref={inputRef}
        type="checkbox"
        checked={on}
        disabled={disabled}
        onChange={(e) => {
          if (checked === undefined) setInner(e.target.checked);
          onChange?.(e);
        }}
        {...rest}
      />
      <span className={`nd-choice__box nd-choice__box--check ${on || indeterminate ? 'nd-choice__box--on' : ''}`}>
        <Icon name={indeterminate && !on ? 'minus' : 'check'} size={13} />
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
