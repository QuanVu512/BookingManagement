import { resolvePublicApiOrigin } from './public-origin.mjs';
export const API_BASE_URL = resolvePublicApiOrigin(
  process.env.NEXT_PUBLIC_API_URL,
  process.env.NODE_ENV === 'production',
);
export const READ_REQUEST_TIMEOUT_MS = 1200;
export const AUTH_REQUEST_TIMEOUT_MS = 10000;
export const SESSION_TRANSIENT_RETRIES = 1;
