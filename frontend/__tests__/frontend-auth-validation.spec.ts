import { describe, expect, it } from '@jest/globals';
import {
  getRegistrationErrors,
  getPasswordStrength,
  getLoginErrors,
  normalizeRegistration,
  normalizePhone,
  isEmail,
} from '../lib/auth-validation.js';

const VALID_FORM = {
  username: 'customer',
  fullName: 'Nguyễn Văn A',
  email: 'customer@business.vn',
  phone: '0912345678',
  password: 'SecretPhrase1!',
  confirmPassword: 'SecretPhrase1!',
};

describe('Frontend auth validation', () => {
  it.each([
    'a'.repeat(12),
    'a'.repeat(64),
    '😀'.repeat(128),
    '  mật khẩu dài có dấu 😀  ',
  ])('accepts Unicode passphrases at backend boundaries: %s', (password) => {
    expect(
      getRegistrationErrors({
        ...VALID_FORM,
        password,
        confirmPassword: password,
      }),
    ).toEqual({});
  });
  it.each(['a'.repeat(11), 'a'.repeat(128), 'a'.repeat(129), '😀'.repeat(128)])(
    'accepts legacy/login passphrases without creation policy: %s',
    (password) => {
      expect(getLoginErrors('customer', password)).toEqual({});
    },
  );
  it('rejects empty login passwords and passwords beyond 1024 UTF-8 bytes', () => {
    expect(getLoginErrors('customer', '')).toHaveProperty('password');
    expect(getLoginErrors('customer', '😀'.repeat(256))).toEqual({});
    expect(getLoginErrors('customer', `${'😀'.repeat(256)}a`)).toHaveProperty(
      'password',
    );
    expect(getLoginErrors('customer', 'a'.repeat(1024))).toEqual({});
    expect(getLoginErrors('customer', 'a'.repeat(1025))).toHaveProperty(
      'password',
    );
  });
  it('keeps the raw login password untouched (no trim, no normalization)', () => {
    const raw = '  mật khẩu legacy 😀  ';
    expect(getLoginErrors('customer', raw)).toEqual({});
  });
  it('accepts Unicode names, corporate email and valid national phones', () => {
    expect(getRegistrationErrors(VALID_FORM)).toEqual({});
  });
  it('normalizes account fields without changing either password', () => {
    expect(
      normalizeRegistration({
        ...VALID_FORM,
        username: ' customer ',
        email: ' CUSTOMER@BUSINESS.VN ',
        fullName: ' Nguyễn Văn A ',
        phone: ' 0912345678 ',
      }),
    ).toEqual({ ...VALID_FORM, phone: '+84912345678' });
  });
  it.each([
    ['username', '12345678'],
    ['username', 'abc1234'],
    ['username', 'name_test'],
    ['email', 'invalid-email'],
    ['phone', '+12025550123'],
    ['phone', '0123456789'],
    ['password', 'mậtkhẩu123'],
    ['password', 'abcde'],
    ['password', 'abc def'],
    ['confirmPassword', 'Mismatch1!'],
    ['fullName', '   '],
  ])('reports invalid %s', (field, value) => {
    expect(
      getRegistrationErrors({ ...VALID_FORM, [field]: value }),
    ).toHaveProperty(field);
  });
  it.each([
    ['a'.repeat(12), 'Yếu'],
    ['a'.repeat(64), 'Yếu'],
    ['abcd1234abcd', 'Vừa'],
    ['abcd1234!@#$', 'Mạnh'],
    ['abcdefghijkl', 'Yếu'],
    ['abcd1234abcd', 'Vừa'],
  ])('measures %s as %s without changing acceptance', (password, label) => {
    expect(getPasswordStrength(password).label).toBe(label);
    expect(
      getRegistrationErrors({
        ...VALID_FORM,
        password,
        confirmPassword: password,
      }),
    ).toEqual({});
  });
  it('allows legacy usernames and all three login identifier forms', () => {
    for (const identifier of ['admin', '0912345678', 'CUSTOMER@BUSINESS.VN']) {
      expect(getLoginErrors(identifier, 'SecretPhrase1!')).toEqual({});
    }
  });
});

describe('Lightweight client validation', () => {
  it.each([
    '0312345678',
    '0512345678',
    '0712345678',
    '0812345678',
    '0912345678',
    '+84912345678',
    '02431234567',
  ])('normalizes supported Vietnamese phone forms: %s', (phone) => {
    expect(normalizePhone(phone)).toBe(
      phone.startsWith('+84') ? phone : `+84${phone.slice(1)}`,
    );
  });
  it.each([
    '091234567',
    '09123456789',
    '+840912345678',
    '84123456789',
    'call 0912345678',
    '0912-345-678',
  ])('rejects an unsupported phone shape: %s', (phone) =>
    expect(normalizePhone(phone)).toBeNull(),
  );
  it.each([
    'test+tag@business.vn',
    'first.last@company.co.uk',
    'person@gmail.com',
    '"quoted local"@company.vn',
    'nguyễn@company.vn',
  ])('accepts supported email syntax without a domain allowlist: %s', (email) =>
    expect(isEmail(email)).toBe(true),
  );
  it.each([
    'test..name@business.vn',
    '.name@company.vn',
    'name.@company.vn',
    'name@-company.vn',
    'name@company',
    `${'a'.repeat(65)}@company.vn`,
  ])('rejects malformed email syntax: %s', (email) =>
    expect(isEmail(email)).toBe(false),
  );
});
