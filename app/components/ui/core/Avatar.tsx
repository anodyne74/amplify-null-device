import React from 'react';
import Image from 'next/image';

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Full name — initials are derived from it. */
  name?: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
}

// Matches .nd-avatar--{size} in components.css — used only as the <Image> intrinsic
// size hint, since `.nd-avatar img { width:100%; height:100% }` is what actually sizes it.
const SIZE_PX: Record<NonNullable<AvatarProps['size']>, number> = { sm: 28, md: 36, lg: 48 };

export function Avatar({ name = '', src, size = 'md', className = '', ...rest }: AvatarProps) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  return (
    <span className={`nd-avatar nd-avatar--${size} ${className}`} title={name || undefined} {...rest}>
      {src ? (
        <Image src={src} alt={name} width={SIZE_PX[size]} height={SIZE_PX[size]} unoptimized />
      ) : (
        initials
      )}
    </span>
  );
}
