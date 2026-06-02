import type { ReactNode } from 'react';
import styles from '@/app/dashboard.module.css';

interface AdminFormFieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  className?: string;
  labelClassName?: string;
  hintClassName?: string;
  children: ReactNode;
}

export default function AdminFormField({
  label,
  htmlFor,
  hint,
  className,
  labelClassName,
  hintClassName,
  children,
}: AdminFormFieldProps) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className={labelClassName}>{label}</label>
      {children}
      {hint && <p className={hintClassName ?? styles.fieldHint}>{hint}</p>}
    </div>
  );
}