import { VIETNAM_PHONE_INPUT_PATTERN } from '../constants/auth-validation.constants.js';

// National significant number pattern copied from the authoritative PostgreSQL
// function in 20261013090000_normalize_auth_phone/migration.sql. Keep both in
// sync when the supported Vietnamese numbering plan changes.
const VIETNAM_NATIONAL_PHONE_PATTERN =
  /^(?:2(?:0[3-9]|1[0-689]|2[0-25-9]|[38][2-9]|4[2-8]|5[124-9]|6[0-39]|7[0-7]|9[0-4679])[0-9]{7}|121[0-3][0-9]{5}|(?:1[46]0|(?:3[0-9]|7[06-9])[0-9]|5(?:[1689][0-9]|2[238]|59)|8(?:[1-8][0-9]|9[6-9])|9(?:[0-8][0-9]|9[013-9]))[0-9]{6}|1800[0-9]{4,6}|12(?:0[13]|28)[0-9]{4}|1900[0-9]{4,6}|[17]99[0-9]{4}|69[0-9]{5,6}|672[0-9]{6})$/;

export function trimAuthValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export function normalizeEmailValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export function normalizeVietnamPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const input = value.trim();
  // Separators are rejected by the DTO contract; do not strip them here.
  if (!VIETNAM_PHONE_INPUT_PATTERN.test(input)) return null;
  const national = input.startsWith('+84') ? input.slice(3) : input.slice(1);
  if (!VIETNAM_NATIONAL_PHONE_PATTERN.test(national)) return null;
  return `+84${national}`;
}

export function normalizePhoneValue({ value }: { value: unknown }): unknown {
  return normalizeVietnamPhone(value) ?? trimAuthValue({ value });
}

export function phoneLookupValues(identifier: string): string[] {
  const phone = normalizeVietnamPhone(identifier);
  if (!phone) return [identifier];
  return [...new Set([phone, `0${phone.slice('+84'.length)}`])];
}
