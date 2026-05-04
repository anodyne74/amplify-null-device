/**
 * Next.js configuration optimized for Amplify Hosting
 * - output: 'export' creates a static HTML export to `out/` directory
 * - images.unoptimized: true for better CDN caching
 * This configuration generates static files suitable for CDN hosting via Amplify
 */

export default {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  assetPrefix: process.env.NEXT_PUBLIC_ASSET_PREFIX || '',
  // Allow dev server to accept requests from local IP addresses (e.g., testing on local network)
  experimental: {
    allowedDevOrigins: ['192.168.10.130', 'localhost', '127.0.0.1'],
  },
};
