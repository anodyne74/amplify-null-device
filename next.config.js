/**
 * Next.js configuration optimized for static export (S3 + CloudFront)
 * - output: 'export' creates an `out/` folder usable with S3 static hosting
 * - images.unoptimized: avoid next image optimization on static hosting
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
