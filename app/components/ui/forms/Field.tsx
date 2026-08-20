import React from 'react';

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
  /** Shown below when there is no error. One short sentence. */
  hint?: React.ReactNode;
  /** Replaces the hint and turns the message red. */
  error?: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
}

export function Field({ label, hint, error, required = false, htmlFor, children, className = '', ...rest }: FieldProps) {
  return (
    <div className={`nd-field ${className}`} {...rest}>
      {label && (
        <label className="nd-field__label" htmlFor={htmlFor}>
          {label}
          {required && <span style={{ color: 'var(--status-danger-fg)' }}> *</span>}
        </label>
      )}
      {children}
      {error ? <span className="nd-field__error">{error}</span> : hint ? <span className="nd-field__hint">{hint}</span> : null}
    </div>
  );
}
