/**
 * Next.js configuration optimized for Amplify Hosting
 * - output: 'export' creates a static HTML export to `out/` directory
 * - images.unoptimized: true for better CDN caching
 * This configuration generates static files suitable for CDN hosting via Amplify
 */

export default {
  reactStrictMode: true,
  output: 'export',
  images: {
    unoptimized: true,
  },
  // If you host behind CloudFront / asset prefix, set NEXT_PUBLIC_ASSET_PREFIX
  assetPrefix: process.env.NEXT_PUBLIC_ASSET_PREFIX || '',
};
