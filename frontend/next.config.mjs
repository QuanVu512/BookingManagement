import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { resolvePublicApiOrigin } from './constants/public-origin.mjs';

config({
  path: fileURLToPath(new URL('../.env', import.meta.url)),
  quiet: true,
});

const apiOrigin = resolvePublicApiOrigin(
  process.env.NEXT_PUBLIC_API_URL,
  process.env.NODE_ENV === 'production',
);
const reportOnlyPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' ${apiOrigin}`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');
/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          {
            key: 'Content-Security-Policy-Report-Only',
            value: reportOnlyPolicy,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
