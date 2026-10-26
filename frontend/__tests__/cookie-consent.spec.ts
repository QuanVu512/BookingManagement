import { describe, expect, it, beforeEach } from '@jest/globals';
import { JSDOM } from 'jsdom';
import {
  readStoredPreferences,
  writeStoredPreferences,
  clearOptionalCookiesAndStorage,
} from '../features/cookie-consent/api/preference-storage';
import {
  CONSENT_STORAGE_KEY,
  CURRENT_COOKIE_POLICY_VERSION,
} from '../features/cookie-consent/model/consent';

const dom = new JSDOM('', { url: 'http://127.0.0.1:4001' });
Object.defineProperty(globalThis, 'window', {
  value: dom.window,
  configurable: true,
});
Object.defineProperty(globalThis, 'localStorage', {
  value: dom.window.localStorage,
  configurable: true,
});

describe('Cookie Preferences Storage & Gating (Phase 3)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('T02-1: trả về null khi chưa có lựa chọn lưu trữ', () => {
    const prefs = readStoredPreferences();
    expect(prefs).toBeNull();
  });

  it('T02-2: lưu lựa chọn chấp nhận cookie hợp lệ với thời hạn 180 ngày', () => {
    const saved = writeStoredPreferences({
      preferences: true,
      analytics: true,
      marketing: false,
    });

    expect(saved.necessary).toBe(true);
    expect(saved.preferences).toBe(true);
    expect(saved.analytics).toBe(true);
    expect(saved.marketing).toBe(false);
    expect(saved.decidedAt).toBeTruthy();
    expect(saved.expiresAt).toBeTruthy();

    const read = readStoredPreferences();
    expect(read).not.toBeNull();
    expect(read?.analytics).toBe(true);
    expect(read?.marketing).toBe(false);
  });

  it('T02-3: từ chối cookie tùy chọn (Reject) ghi nhận tất cả optional=false', () => {
    const saved = writeStoredPreferences({
      preferences: false,
      analytics: false,
      marketing: false,
    });

    expect(saved.necessary).toBe(true);
    expect(saved.preferences).toBe(false);
    expect(saved.analytics).toBe(false);
    expect(saved.marketing).toBe(false);

    const read = readStoredPreferences();
    expect(read?.preferences).toBe(false);
    expect(read?.analytics).toBe(false);
    expect(read?.marketing).toBe(false);
  });

  it('T02-4: từ chối tải dữ liệu lưu trữ đã hết hạn hoặc sai schemaVersion', () => {
    const expiredData = {
      schemaVersion: 1,
      policyVersion: CURRENT_COOKIE_POLICY_VERSION,
      necessary: true,
      preferences: true,
      analytics: true,
      marketing: true,
      decidedAt: '2025-01-01T00:00:00.000Z',
      expiresAt: '2025-06-01T00:00:00.000Z',
    };
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(expiredData));

    expect(readStoredPreferences()).toBeNull();

    const wrongSchema = {
      schemaVersion: 99,
      policyVersion: CURRENT_COOKIE_POLICY_VERSION,
    };
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(wrongSchema));
    expect(readStoredPreferences()).toBeNull();
  });

  it('T02-5: dọn dẹp storage khi rút lại consent (revoke)', () => {
    window.localStorage.setItem('booking:analytics:session', 'sample-session');
    window.localStorage.setItem('booking:marketing:campaign', 'sample-campaign');
    window.localStorage.setItem('booking:auth:token', 'keep-essential-token');

    clearOptionalCookiesAndStorage();

    expect(window.localStorage.getItem('booking:analytics:session')).toBeNull();
    expect(window.localStorage.getItem('booking:marketing:campaign')).toBeNull();
    expect(window.localStorage.getItem('booking:auth:token')).toBe('keep-essential-token');
  });
});
