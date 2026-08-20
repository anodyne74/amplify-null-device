import React from 'react';
import { Icon } from './Icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = the one committing action per view. inverse is for navy surfaces only. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse';
  size?: 'sm' | 'md' | 'lg';
  /** Lucide icon name shown before the label. */
  iconLeft?: string;
  /** Lucide icon name shown after the label. */
  iconRight?: string;
  loading?: boolean;
  /** Full-width — mobile app and dialog footers. */
  block?: boolean;
  /** Render as "a" for links. */
  as?: 'button' | 'a';
}

export function Button({
  variant = 'primary',
  size = 'md',
  iconLeft,
  iconRight,
  loading = false,
  block = false,
  disabled = false,
  as = 'button',
  children,
  className = '',
  ...rest
}: ButtonProps) {
  const Tag = as as React.ElementType;
  const cls = ['nd-btn', `nd-btn--${variant}`, `nd-btn--${size}`, block ? 'nd-btn--block' : '', className]
    .filter(Boolean)
    .join(' ');
  const glyph = size === 'sm' ? 15 : size === 'lg' ? 19 : 17;

  return (
    <Tag
      className={cls}
      disabled={Tag === 'button' ? disabled || loading : undefined}
      aria-disabled={disabled || loading || undefined}
      {...rest}
    >
      {loading && <span className="nd-btn__spinner" />}
      {!loading && iconLeft && <Icon name={iconLeft} size={glyph} />}
      {children}
      {iconRight && <Icon name={iconRight} size={glyph} />}
    </Tag>
  );
}
