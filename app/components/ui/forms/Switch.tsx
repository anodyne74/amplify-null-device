import React from 'react';

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
}

export function Switch({ checked, defaultChecked, onChange, label, disabled = false, className = '', ...rest }: SwitchProps) {
  const [inner, setInner] = React.useState(!!defaultChecked);
  const on = checked !== undefined ? checked : inner;

  return (
    <label className={`nd-switch ${disabled ? 'nd-switch--disabled' : ''} ${className}`}>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        disabled={disabled}
        onChange={(e) => {
          if (checked === undefined) setInner(e.target.checked);
          onChange?.(e);
        }}
        {...rest}
      />
      <span className={`nd-switch__track ${on ? 'nd-switch__track--on' : ''}`}>
        <span className="nd-switch__thumb" />
      </span>
      {label && <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-body)' }}>{label}</span>}
    </label>
  );
}
