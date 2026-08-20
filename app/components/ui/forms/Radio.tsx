import React from 'react';

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  description?: React.ReactNode;
}

export function Radio({ checked, name, value, onChange, label, description, disabled = false, className = '', ...rest }: RadioProps) {
  return (
    <label className={`nd-choice ${disabled ? 'nd-choice--disabled' : ''} ${className}`}>
      <input type="radio" name={name} value={value} checked={checked} disabled={disabled} onChange={onChange} {...rest} />
      <span className={`nd-choice__box nd-choice__box--radio ${checked ? 'nd-choice__box--on' : ''}`}>
        {checked && <span className="nd-choice__dot" />}
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
