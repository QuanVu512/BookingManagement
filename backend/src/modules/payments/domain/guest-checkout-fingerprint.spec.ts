import { describe, expect, it } from '@jest/globals';
import {
  GUEST_FINGERPRINT_VERSION,
  GuestCheckoutPayloadError,
  buildCanonicalGuestHoldPayload,
  createGuestHoldFingerprint,
  normalizeGuestEmail,
  normalizeGuestInstant,
  normalizeGuestName,
  normalizeGuestPhone,
} from './guest-checkout-fingerprint.js';

const BASE_PAYLOAD = {
  courtId: '3F2504E0-4F89-41D3-9A0C-0305E82C3301',
  startsAt: '2026-10-29T10:00:00+07:00',
  endsAt: '2026-10-29T11:00:00+07:00',
  email: '  Guest@Example.COM ',
  name: '  Nguyễn   Văn A ',
  phone: '+84 90.123-4567',
  termsVersion: ' v1 ',
};

const EXPECTED_CANONICAL = [
  'booking.guest-hold.fingerprint.v1',
  'courtId:36:3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  'startsAt:24:2026-10-29T03:00:00.000Z',
  'endsAt:24:2026-10-29T04:00:00.000Z',
  'email:17:guest@example.com',
  'name:15:Nguyễn Văn A',
  'phone:12:+84901234567',
  'termsVersion:2:v1',
].join('\n');

const EXPECTED_DIGEST =
  '6a6517b2ca10a88307f2e91c322ae5027c761de0733fb779d050ffdab9243c8c';

function expectPayloadError(
  action: () => unknown,
  code: GuestCheckoutPayloadError['code'],
): void {
  try {
    action();
  } catch (error: unknown) {
    if (!(error instanceof GuestCheckoutPayloadError)) {
      throw new Error(`Expected GuestCheckoutPayloadError ${code}`);
    }
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected GuestCheckoutPayloadError ${code}`);
}

describe('guest checkout payload fingerprint v1', () => {
  it('serializes every field with UTF-8 byte length prefix', () => {
    expect(buildCanonicalGuestHoldPayload(BASE_PAYLOAD)).toBe(
      EXPECTED_CANONICAL,
    );
  });

  it('produces the fixed v1 digest fixture', () => {
    const result = createGuestHoldFingerprint(BASE_PAYLOAD);
    expect(result.version).toBe(GUEST_FINGERPRINT_VERSION);
    expect(result.digest).toBe(EXPECTED_DIGEST);
    expect(result.digest).toHaveLength(64);
  });

  it('treats equivalent timezones and Unicode forms as one payload', () => {
    const decomposedName = BASE_PAYLOAD.name.normalize('NFD');
    const utcPayload = {
      ...BASE_PAYLOAD,
      startsAt: '2026-10-29T03:00:00.000Z',
      endsAt: '2026-10-29T04:00:00.000Z',
      name: decomposedName,
    };
    expect(createGuestHoldFingerprint(utcPayload)).toEqual(
      createGuestHoldFingerprint(BASE_PAYLOAD),
    );
  });

  it('changes digest when a field value moves across the field boundary', () => {
    const swapped = {
      ...BASE_PAYLOAD,
      name: 'Nguyễn Văn A+84901234567',
      phone: '0901234567',
    };
    expect(createGuestHoldFingerprint(swapped).digest).not.toBe(
      EXPECTED_DIGEST,
    );
  });

  it('keeps the phone value as an identifier string', () => {
    expect(normalizeGuestPhone('0901 234 567')).toBe('0901234567');
    expect(normalizeGuestPhone('+84 (90) 123-4567')).toBe('+84901234567');
    expect(normalizeGuestPhone('0901234567')).not.toBe('+84901234567');
  });

  it('normalizes email and person name deterministically', () => {
    expect(normalizeGuestEmail('  GUEST@Example.com ')).toBe(
      'guest@example.com',
    );
    expect(normalizeGuestName('  Nguyễn\tVăn   A ')).toBe('Nguyễn Văn A');
  });

  it('rejects timestamps without an explicit timezone', () => {
    expectPayloadError(
      () =>
        buildCanonicalGuestHoldPayload({
          ...BASE_PAYLOAD,
          startsAt: '2026-10-29T10:00:00',
        }),
      'INVALID_INSTANT',
    );
  });

  it('rejects calendar dates that do not exist instead of rolling them', () => {
    for (const invalid of [
      '2026-02-30T10:00:00Z',
      '2026-04-31T10:00:00Z',
      '2026-02-29T10:00:00Z',
      '2026-13-01T10:00:00Z',
      '2026-02-30T10:00:00+07:00',
    ]) {
      expectPayloadError(
        () => normalizeGuestInstant(invalid),
        'INVALID_CALENDAR_DATE',
      );
    }
    expect(normalizeGuestInstant('2024-02-29T10:00:00Z')).toBe(
      '2024-02-29T10:00:00.000Z',
    );
    expect(normalizeGuestInstant('2026-02-28T23:59:59.999Z')).toBe(
      '2026-02-28T23:59:59.999Z',
    );
  });

  it('rejects out-of-range time and offset components', () => {
    expectPayloadError(
      () => normalizeGuestInstant('2026-10-29T24:00:00Z'),
      'INVALID_INSTANT',
    );
    expectPayloadError(
      () => normalizeGuestInstant('2026-10-29T10:60:00Z'),
      'INVALID_INSTANT',
    );
    expectPayloadError(
      () => normalizeGuestInstant('2026-10-29T10:00:60Z'),
      'INVALID_INSTANT',
    );
    expectPayloadError(
      () => normalizeGuestInstant('2026-10-29T10:00:00+24:00'),
      'INVALID_INSTANT',
    );
  });

  it('rejects inverted ranges, invalid phone and missing terms version', () => {
    expectPayloadError(
      () =>
        buildCanonicalGuestHoldPayload({
          ...BASE_PAYLOAD,
          endsAt: '2026-10-29T02:00:00Z',
        }),
      'INVALID_RANGE',
    );
    expectPayloadError(
      () => normalizeGuestPhone('0901-CALL-NOW'),
      'INVALID_PHONE',
    );
    expectPayloadError(
      () =>
        buildCanonicalGuestHoldPayload({ ...BASE_PAYLOAD, termsVersion: ' ' }),
      'INVALID_TERMS_VERSION',
    );
  });
});
