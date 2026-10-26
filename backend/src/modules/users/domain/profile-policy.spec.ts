import { describe, expect, it } from '@jest/globals';
import {
  normalizeAvatarUrl,
  normalizeFullName,
  normalizeProfilePatch,
} from './profile-policy.js';

describe('profile-policy (C12)', () => {
  it('chuẩn hóa họ tên: trim + gộp khoảng trắng', () => {
    expect(normalizeFullName('  Nguyễn   Văn A ')).toBe('Nguyễn Văn A');
  });

  it('từ chối họ tên rỗng / quá dài / không phải chuỗi', () => {
    for (const value of ['', '   ', 'a'.repeat(151), 123, null]) {
      expect(() => normalizeFullName(value)).toThrow();
    }
    expect(normalizeFullName('a'.repeat(150))).toHaveLength(150);
  });

  it('avatar: rỗng/null → null; chỉ http/https', () => {
    expect(normalizeAvatarUrl(null)).toBeNull();
    expect(normalizeAvatarUrl('   ')).toBeNull();
    expect(normalizeAvatarUrl('https://cdn.example/a.png')).toContain(
      'https://',
    );
    for (const value of [
      'javascript:alert(1)',
      'data:image/png;base64,xx',
      'ftp://x/y.png',
      'not a url',
      'https://exa mple.com/a.png',
    ]) {
      expect(() => normalizeAvatarUrl(value)).toThrow();
    }
  });

  it('patch chỉ validate field được gửi', () => {
    expect(normalizeProfilePatch({})).toEqual({});
    expect(
      normalizeProfilePatch({ fullName: '  An  ' }),
    ).toEqual({ fullName: 'An' });
    expect(() => normalizeProfilePatch({ fullName: '' })).toThrow();
  });
});
