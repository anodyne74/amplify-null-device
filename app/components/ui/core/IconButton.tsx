import React from 'react';
import { Icon } from './Icon';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Lucide icon name. */
  icon: string;
  /** Required accessible label — also used as the tooltip. */
  label: string;
  variant?: 'ghost' | 'outline' | 'solid';
  size?: 'sm' | 'md' | 'lg';
}

export function IconButton({ icon, label, variant = 'ghost', size = 'md', disabled = false, className = '', ...rest }: IconButtonProps) {
  const cls = ['nd-iconbtn', `nd-iconbtn--${variant}`, `nd-iconbtn--${size}`, className].filter(Boolean).join(' ');
  return (
    <button className={cls} aria-label={label} title={label} disabled={disabled} {...rest}>
      <Icon name={icon} size={size === 'sm' ? 16 : size === 'lg' ? 20 : 18} />
    </button>
  );
}
