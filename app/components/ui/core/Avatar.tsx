import React from 'react';

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Full name — initials are derived from it. */
  name?: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Avatar({ name = '', src, size = 'md', className = '', ...rest }: AvatarProps) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  return (
    <span className={`nd-avatar nd-avatar--${size} ${className}`} title={name || undefined} {...rest}>
      {src ? <img src={src} alt={name} /> : initials}
    </span>
  );
}
