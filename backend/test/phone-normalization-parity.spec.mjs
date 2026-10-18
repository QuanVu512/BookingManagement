import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { normalizeVietnamPhonePure } from '../prisma/audit-auth-phones.mjs';
import { normalizeVietnamPhone } from '../src/modules/auth/helpers/auth-normalization.ts';

const CORPUS = JSON.parse(
  readFileSync(
    new URL('./fixtures/test-phone-corpus.json', import.meta.url),
    'utf8',
  ),
).cases;

describe('TypeScript and audit phone normalization parity', () => {
  test.each(CORPUS.map(({ input, expected }) => [input, expected]))(
    'normalizes %p consistently',
    (input, expected) => {
      expect(normalizeVietnamPhone(input)).toBe(expected);
      expect(normalizeVietnamPhonePure(input)).toBe(expected);
    },
  );

  test('rejects undefined input consistently', () => {
    expect(normalizeVietnamPhone(undefined)).toBeNull();
    expect(normalizeVietnamPhonePure(undefined)).toBeNull();
  });
});
