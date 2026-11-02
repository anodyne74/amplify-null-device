/**
 * Next.js configuration optimized for Amplify Hosting
 * - output: 'export' creates a static HTML export to `out/` directory
 * - images.unoptimized: true for better CDN caching
 * This configuration generates static files suitable for CDN hosting via Amplify
 */

import { resolveBuildNumber } from './scripts/build-number.js';

export default {
  reactStrictMode: true,
  // The Build Number (CONTEXT.md, Build), inlined into the browser bundle and the API routes alike.
  env: { NEXT_PUBLIC_BUILD_NUMBER: resolveBuildNumber() },
  // Loaded from node_modules at run time, not bundled: pdfjs finds its own worker file that way (lib/server/pdfLayoutText.ts).
  serverExternalPackages: ['pdfjs-dist'],
  images: {
    unoptimized: true,
  },
  assetPrefix: process.env.NEXT_PUBLIC_ASSET_PREFIX || '',
  // Allow dev server to accept requests from local IP addresses (e.g., testing on local network)
  allowedDevOrigins: ['192.168.10.130', 'localhost', '127.0.0.1'],
  async redirects() {
    return [
      // The customer page was "Standing Orders" until it became Route Defaults (#481).
      { source: '/customer/orders', destination: '/customer/route-defaults', permanent: true },
    ];
  },
};
