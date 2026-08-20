import React from 'react';

// NOTE: brand SVG/PNG assets referenced below (logo-full-dark.svg, etc.) have not
// been copied into this repo's public/ directory yet — that happens when a page
// actually wires up this component. `base` defaults to the Next.js public-folder
// convention (a root-relative path), not the design system's own relative "assets/".
const BASE = '/brand/';

// Every lockup file shares one padded viewBox, so the component crops to the
// ink: for a visible height H the band is 3.567H wide and the image is scaled
// to 4.568H x 2.045H behind it.
const FILES: Record<string, string> = {
  dark: 'logo-full-dark.svg',
  light: 'logo-full-light.svg',
  grayscale: 'logo-full-grayscale.svg',
  tile: 'logo-full-navy.svg',
};

export interface LogoProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** "full" = ring + wordmark, "symbol" = ring only (favicons, mobile headers, avatars). */
  variant?: 'full' | 'symbol';
  /** dark = near-black wordmark on any light surface (default); light = white wordmark for navy and night surfaces; grayscale for print/mono; tile = the navy-block artwork, only when a solid brand chip is wanted. */
  theme?: 'dark' | 'light' | 'grayscale' | 'tile';
  /** symbol only: true keeps the opaque navy tile artwork; false (default) uses the transparent ring. */
  tile?: boolean;
  /** Rendered height in px. Never below 20px for the full lockup. */
  height?: number;
  /** Path prefix to the assets folder, e.g. "/brand/". */
  base?: string;
}

export function Logo({ variant = 'full', theme = 'dark', height = 32, tile = false, base = BASE, className = '', ...rest }: LogoProps) {
  if (variant === 'symbol') {
    return (
      <span className={`nd-logo ${className}`} {...rest}>
        <img
          src={base + (tile ? 'logo-symbol.png' : 'logo-symbol-transparent.png')}
          alt="Null Device"
          style={{ height, width: height, display: 'block' }}
        />
      </span>
    );
  }

  return (
    <span className={`nd-logo ${className}`} {...rest}>
      <span className="nd-logo__crop" style={{ width: 3.567 * height, height }}>
        <img
          src={base + (FILES[theme] || FILES.dark)}
          alt="Null Device"
          style={{ left: -0.534 * height, top: -0.536 * height, width: 4.568 * height, height: 2.045 * height }}
        />
      </span>
    </span>
  );
}
