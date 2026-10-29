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
// Enforced CSP: `unsafe-inline`/`unsafe-eval` stay because Next.js App
// Router hydration and inlined styles require them without a per-request
// nonce setup; tightening to nonces/hashes needs browser verification
// (see docs/SECURITY.md) and must not be done blindly in this static config.
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: https: blob:",
  "font-src 'self' https: data:",
  `connect-src 'self' ${apiOrigin} wss: https:`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  'upgrade-insecure-requests',
];
const contentSecurityPolicy = cspDirectives.join('; ');
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
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
        ],
      },
    ];
  },
};

export default nextConfig;
