import React from 'react';

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  label?: React.ReactNode;
  showValue?: boolean;
  tone?: 'brand' | 'success' | 'warning' | 'danger';
}

export function ProgressBar({ value = 0, max = 100, label, showValue = true, tone = 'brand', className = '', ...rest }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));

  return (
    <div className={`nd-progress ${className}`} {...rest}>
      {(label || showValue) && (
        <div className="nd-progress__meta">
          <span>{label}</span>
          {showValue && <span>{Math.round(pct)}%</span>}
        </div>
      )}
      <div className="nd-progress__track" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
        <div className={`nd-progress__fill ${tone !== 'brand' ? 'nd-progress__fill--' + tone : ''}`} style={{ width: pct + '%' }} />
      </div>
    </div>
  );
}
