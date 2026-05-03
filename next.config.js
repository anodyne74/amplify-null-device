/**
 * Next.js configuration optimized for Amplify Hosting
 * - output: 'export' creates a static HTML export to `out/` directory
 * - images.unoptimized: true for better CDN caching
 * This configuration generates static files suitable for CDN hosting via Amplify
 */

export default {
  reactStrictMode: true,
  // Remove: output: 'export',
  images: {
    unoptimized: true,
  },
  assetPrefix: process.env.NEXT_PUBLIC_ASSET_PREFIX || '',
};
