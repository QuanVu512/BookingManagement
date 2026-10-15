/**
 * @param {string | undefined} value
 * @param {boolean} production
 * @returns {string}
 */
export function resolvePublicApiOrigin(value, production) {
  if (!value && production)
    throw new Error('NEXT_PUBLIC_API_URL is required in production.');
  const url = new URL(value ?? 'http://localhost:4000');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    !(
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && !production && local)
    )
  ) {
    throw new Error(
      'NEXT_PUBLIC_API_URL must be an HTTPS origin (HTTP loopback only in development/test).',
    );
  }
  return url.origin;
}
