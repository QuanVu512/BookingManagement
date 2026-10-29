import { createHash } from 'node:crypto';

/**
 * Canonical payload fingerprint cho guest checkout intent (Contract F3).
 *
 * Mọi field đều được length-prefix theo byte UTF-8, kể cả courtId/email/
 * termsVersion, để hai payload khác ranh giới field không thể trùng chuỗi.
 * Định dạng này có version; thay đổi thuật toán phải tăng
 * GUEST_FINGERPRINT_VERSION và giữ hàm cho version cũ.
 */
export const GUEST_FINGERPRINT_VERSION = 'v1';
export const GUEST_FINGERPRINT_DOMAIN = 'booking.guest-hold.fingerprint.v1';

const EMAIL_MAX_LENGTH = 254;
const NAME_MAX_LENGTH = 150;
const TERMS_VERSION_MAX_LENGTH = 30;
const PHONE_MIN_DIGITS = 7;
const PHONE_MAX_DIGITS = 15;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const INSTANT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

export type GuestCheckoutPayloadErrorCode =
  | 'INVALID_COURT_ID'
  | 'INVALID_INSTANT'
  | 'INVALID_CALENDAR_DATE'
  | 'INVALID_RANGE'
  | 'INVALID_EMAIL'
  | 'INVALID_NAME'
  | 'INVALID_PHONE'
  | 'INVALID_TERMS_VERSION';

export class GuestCheckoutPayloadError extends Error {
  constructor(
    readonly code: GuestCheckoutPayloadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GuestCheckoutPayloadError';
  }
}

export interface GuestHoldFingerprintPayload {
  courtId: string;
  startsAt: string;
  endsAt: string;
  email: string;
  name: string;
  phone: string;
  termsVersion: string;
}

export interface GuestHoldFingerprintResult {
  version: typeof GUEST_FINGERPRINT_VERSION;
  digest: string;
}

export function normalizeGuestCourtId(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new GuestCheckoutPayloadError(
      'INVALID_COURT_ID',
      'courtId phải là UUID.',
    );
  }
  return normalized;
}

/**
 * `Date` tự cuộn ngày không tồn tại (30/02 -> 02/03). Fingerprint phải từ chối
 * trước khi chuẩn hóa, nếu không hai ngày khác nhau sinh cùng digest.
 */
function assertCalendarDate(year: number, month: number, day: number): void {
  const probe = new Date(0);
  probe.setUTCHours(0, 0, 0, 0);
  probe.setUTCFullYear(year, month - 1, day);
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new GuestCheckoutPayloadError(
      'INVALID_CALENDAR_DATE',
      'Ngày không tồn tại trong lịch.',
    );
  }
}

export function normalizeGuestInstant(value: string): string {
  const normalized = value.trim();
  const match = INSTANT_PATTERN.exec(normalized);
  if (!match) {
    throw new GuestCheckoutPayloadError(
      'INVALID_INSTANT',
      'Thời gian phải là ISO 8601 có múi giờ tường minh.',
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);
  const offset = match[7];
  assertCalendarDate(year, month, day);
  if (hour > 23 || minute > 59 || second > 59) {
    throw new GuestCheckoutPayloadError(
      'INVALID_INSTANT',
      'Thời gian phải là ISO 8601 có múi giờ tường minh.',
    );
  }
  if (offset !== 'Z') {
    const offsetHours = Number(offset.slice(1, 3));
    const offsetMinutes = Number(offset.slice(4, 6));
    if (offsetHours > 23 || offsetMinutes > 59) {
      throw new GuestCheckoutPayloadError(
        'INVALID_INSTANT',
        'Độ lệch múi giờ không hợp lệ.',
      );
    }
  }
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) {
    throw new GuestCheckoutPayloadError(
      'INVALID_INSTANT',
      'Thời gian phải là ISO 8601 có múi giờ tường minh.',
    );
  }
  return parsed.toISOString();
}

export function normalizeGuestEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(normalized)) {
    throw new GuestCheckoutPayloadError('INVALID_EMAIL', 'Email không hợp lệ.');
  }
  return normalized;
}

export function normalizeGuestName(value: string): string {
  const normalized = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (normalized.length === 0 || normalized.length > NAME_MAX_LENGTH) {
    throw new GuestCheckoutPayloadError('INVALID_NAME', 'Tên không hợp lệ.');
  }
  return normalized;
}

export function normalizeGuestPhone(value: string): string {
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[\s().-]/gu, '');
  const canonical = hasPlus ? digits.slice(1) : digits;
  if (
    !/^\d+$/.test(canonical) ||
    canonical.length < PHONE_MIN_DIGITS ||
    canonical.length > PHONE_MAX_DIGITS
  ) {
    throw new GuestCheckoutPayloadError(
      'INVALID_PHONE',
      'Số điện thoại không hợp lệ.',
    );
  }
  return hasPlus ? `+${canonical}` : canonical;
}

export function normalizeGuestTermsVersion(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > TERMS_VERSION_MAX_LENGTH) {
    throw new GuestCheckoutPayloadError(
      'INVALID_TERMS_VERSION',
      'termsVersion không hợp lệ.',
    );
  }
  return normalized;
}

function assertInstantOrder(startsAt: string, endsAt: string): void {
  if (Date.parse(startsAt) >= Date.parse(endsAt)) {
    throw new GuestCheckoutPayloadError(
      'INVALID_RANGE',
      'Thời gian kết thúc phải sau thời gian bắt đầu.',
    );
  }
}

function encodeField(name: string, value: string): string {
  return `${name}:${Buffer.byteLength(value, 'utf8')}:${value}`;
}

/**
 * Trả chuỗi canonical (có PII) chỉ dùng nội bộ cho hash/test vector.
 * Không log hoặc trả trực tiếp ra API.
 */
export function buildCanonicalGuestHoldPayload(
  payload: GuestHoldFingerprintPayload,
): string {
  const courtId = normalizeGuestCourtId(payload.courtId);
  const startsAt = normalizeGuestInstant(payload.startsAt);
  const endsAt = normalizeGuestInstant(payload.endsAt);
  assertInstantOrder(startsAt, endsAt);
  const fields: ReadonlyArray<readonly [string, string]> = [
    ['courtId', courtId],
    ['startsAt', startsAt],
    ['endsAt', endsAt],
    ['email', normalizeGuestEmail(payload.email)],
    ['name', normalizeGuestName(payload.name)],
    ['phone', normalizeGuestPhone(payload.phone)],
    ['termsVersion', normalizeGuestTermsVersion(payload.termsVersion)],
  ];
  return [
    GUEST_FINGERPRINT_DOMAIN,
    ...fields.map(([name, value]) => encodeField(name, value)),
  ].join('\n');
}

export function createGuestHoldFingerprint(
  payload: GuestHoldFingerprintPayload,
): GuestHoldFingerprintResult {
  const digest = createHash('sha256')
    .update(buildCanonicalGuestHoldPayload(payload), 'utf8')
    .digest('hex');
  return { version: GUEST_FINGERPRINT_VERSION, digest };
}
