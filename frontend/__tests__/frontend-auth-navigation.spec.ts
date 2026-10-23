import { describe, expect, it } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { authReturnPath } from '../lib/auth-navigation.js';
const dom = new JSDOM('', { url: 'http://127.0.0.1:4001' });
Object.defineProperty(globalThis, 'window', {
  value: dom.window,
  configurable: true,
});
describe('Auth return destinations', () => {
  it.each([
    '/',
    '/booking',
    '/bookings',
    '/account',
    '/account/security',
    '/account/payments',
    '/courts/court-1',
  ])('preserves the permitted destination %s', (destination) => {
    dom.window.history.replaceState(
      null,
      '',
      `/auth/login?next=${encodeURIComponent(destination)}`,
    );
    expect(authReturnPath()).toBe(destination);
  });
  it.each([
    'https://example.com',
    '//example.com',
    'javascript:alert(1)',
    '/%2fexample.com',
    '/unknown',
    '/auth/login',
  ])('rejects the untrusted destination %s', (destination) => {
    dom.window.history.replaceState(
      null,
      '',
      `/auth/login?next=${encodeURIComponent(destination)}`,
    );
    expect(authReturnPath()).toBe('/');
  });
});
