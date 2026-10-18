import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import {
  normalizePhoneValue,
  normalizeVietnamPhone,
  phoneLookupValues,
} from './auth-normalization.js';

type PhoneCorpusCase = {
  category: string;
  input: unknown;
  expected: string | null;
};

const PHONE_CORPUS: PhoneCorpusCase[] = (
  JSON.parse(
    readFileSync(
      new URL(
        '../../../../test/fixtures/test-phone-corpus.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as { cases: PhoneCorpusCase[] }
).cases;

const VALID_PHONES: [string, string][] = PHONE_CORPUS.filter(
  (entry) => typeof entry.input === 'string' && entry.expected !== null,
).map((entry) => [entry.input as string, entry.expected as string]);

const INVALID_STRING_PHONES = PHONE_CORPUS.filter(
  (entry) => typeof entry.input === 'string' && entry.expected === null,
).map((entry) => entry.input as string);

const NON_STRING_PHONES = PHONE_CORPUS.filter(
  (entry) => typeof entry.input !== 'string',
).map((entry) => entry.input);

describe('Vietnamese phone normalization (authoritative SQL parity)', () => {
  it.each(VALID_PHONES)('normalizes %s to %s', (input, expected) => {
    expect(normalizeVietnamPhone(input)).toBe(expected);
  });

  it.each(INVALID_STRING_PHONES)('rejects %s', (input) => {
    expect(normalizeVietnamPhone(input)).toBeNull();
  });

  it.each([...NON_STRING_PHONES, undefined])(
    'rejects non-string input %s',
    (input) => {
      expect(normalizeVietnamPhone(input)).toBeNull();
    },
  );

  it('is idempotent for every accepted form', () => {
    for (const [, expected] of VALID_PHONES) {
      expect(normalizeVietnamPhone(expected)).toBe(expected);
    }
  });

  it('keeps both canonical lookup forms while preserving invalid identifiers', () => {
    expect(phoneLookupValues('0912345678')).toEqual([
      '+84912345678',
      '0912345678',
    ]);
    expect(phoneLookupValues('+84912345678')).toEqual([
      '+84912345678',
      '0912345678',
    ]);
    expect(phoneLookupValues('customer@example.com')).toEqual([
      'customer@example.com',
    ]);
  });

  it('leaves invalid phone input for the DTO validator to reject', () => {
    expect(normalizePhoneValue({ value: ' 0912-345-678 ' })).toBe(
      '0912-345-678',
    );
    expect(normalizePhoneValue({ value: ' 0912345678 ' })).toBe('+84912345678');
  });
});
