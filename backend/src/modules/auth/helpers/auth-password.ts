import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from '../constants/auth-validation.constants.js';

export function isValidAuthPassword(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > PASSWORD_MAX_LENGTH * 2)
    return false;
  const length = Array.from(value).length;
  return length >= PASSWORD_MIN_LENGTH && length <= PASSWORD_MAX_LENGTH;
}
