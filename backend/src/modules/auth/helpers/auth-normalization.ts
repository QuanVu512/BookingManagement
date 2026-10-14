import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { VIETNAM_PHONE_INPUT_PATTERN } from '../constants/auth-validation.constants.js';

export function trimAuthValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export function normalizeEmailValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export function normalizeVietnamPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const input = value.trim();
  if (!VIETNAM_PHONE_INPUT_PATTERN.test(input)) return null;
  const phone = parsePhoneNumberFromString(input, {
    defaultCountry: 'VN',
    extract: false,
  });
  return phone?.country === 'VN' && phone.isValid() ? phone.number : null;
}

export function normalizePhoneValue({ value }: { value: unknown }): unknown {
  return normalizeVietnamPhone(value) ?? trimAuthValue({ value });
}

export function phoneLookupValues(identifier: string): string[] {
  const phone = normalizeVietnamPhone(identifier);
  if (!phone) return [identifier];
  return [...new Set([phone, `0${phone.slice('+84'.length)}`])];
}
