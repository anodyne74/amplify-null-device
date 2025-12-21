/**
 * Next.js configuration optimized for Amplify Hosting
 * - output: 'standalone' creates a Node.js server usable with Amplify Hosting
 * - images.unoptimized: true for better CDN caching
 */

export default {
  reactStrictMode: true,
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  // If you host behind CloudFront / asset prefix, set NEXT_PUBLIC_ASSET_PREFIX
  assetPrefix: process.env.NEXT_PUBLIC_ASSET_PREFIX || '',
};
