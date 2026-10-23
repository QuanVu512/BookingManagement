import type { RegistrationData } from '../types/auth';

export const AUTH_LIMITS = {
  usernameMin: 8,
  usernameMax: 100,
  passwordMin: 7,
  passwordMax: 128,
  fullNameMax: 150,
  emailMax: 254,
  phoneMax: 20,
  identifierMax: 254,
} as const;

export const LOGIN_PASSWORD_MAX_BYTES = 1024;
const PASSWORD_LETTER_PATTERN = /\p{L}/u;
export const PASSWORD_REQUIREMENT_MESSAGE =
  'Mật khẩu phải dài hơn 6 ký tự, tối đa 128 ký tự và chứa ít nhất một chữ cái.';

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

const USERNAME_PATTERN = /^(?=.*[A-Za-z])[A-Za-z0-9]+$/;
const VIETNAM_PHONE_PATTERN = /^(?:0|\+84)(?:[35789][0-9]{8}|2[0-9]{9})$/;
// RFC dot-atom / quoted local parts and DNS domains; the backend validates final eligibility.
const EMAIL_PATTERN =
  /^(?:[\p{L}\p{N}!#$%&'*+/=?^_`{|}~-]+(?:\.[\p{L}\p{N}!#$%&'*+/=?^_`{|}~-]+)*|"(?:[^"\\\r\n]|\\[\x20-\x7e])+")@(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+(?:[\p{L}]{2,63}|xn--[A-Za-z0-9-]{2,59})$/u;
const EMAIL_LOCAL_PART_MAX_LENGTH = 64;
export type AuthFieldErrors = Partial<Record<keyof RegistrationData, string>>;

export function normalizePhone(phone: string): string | null {
  const input = phone.trim();
  if (!VIETNAM_PHONE_PATTERN.test(input)) return null;
  return input.startsWith('+84') ? input : `+84${input.slice(1)}`;
}

export function isEmail(value: string): boolean {
  return (
    value.length <= AUTH_LIMITS.emailMax &&
    value.lastIndexOf('@') <= EMAIL_LOCAL_PART_MAX_LENGTH &&
    EMAIL_PATTERN.test(value)
  );
}

export function normalizeRegistration(
  form: RegistrationData,
): RegistrationData {
  return {
    ...form,
    username: form.username.trim(),
    fullName: form.fullName.trim(),
    email: form.email.trim().toLowerCase(),
    phone: normalizePhone(form.phone) ?? form.phone.trim(),
  };
}

export function getRegistrationErrors(form: RegistrationData): AuthFieldErrors {
  const values = normalizeRegistration(form);
  const errors: AuthFieldErrors = {};
  if (
    values.username.length < AUTH_LIMITS.usernameMin ||
    values.username.length > AUTH_LIMITS.usernameMax ||
    !USERNAME_PATTERN.test(values.username)
  ) {
    errors.username =
      'Tên đăng nhập cần 8–100 ký tự, chỉ chữ Latin và số, có ít nhất một chữ.';
  }
  const passwordError = getPasswordError(form.password);
  if (passwordError) errors.password = passwordError;
  if (!values.fullName || values.fullName.length > AUTH_LIMITS.fullNameMax)
    errors.fullName = 'Họ tên bắt buộc, tối đa 150 ký tự.';
  if (values.email.length > AUTH_LIMITS.emailMax || !isEmail(values.email))
    errors.email = 'Vui lòng nhập email hợp lệ (cá nhân hoặc doanh nghiệp).';
  if (!normalizePhone(form.phone))
    errors.phone = 'Nhập số Việt Nam hợp lệ dạng 0… hoặc +84….';
  if (!form.confirmPassword || form.password !== form.confirmPassword)
    errors.confirmPassword = 'Mật khẩu xác nhận không khớp.';
  return errors;
}

export function getPasswordError(password: string): string | undefined {
  const length = Array.from(password).length;
  if (
    length < AUTH_LIMITS.passwordMin ||
    length > AUTH_LIMITS.passwordMax ||
    !PASSWORD_LETTER_PATTERN.test(password)
  ) {
    return PASSWORD_REQUIREMENT_MESSAGE;
  }
  return undefined;
}

export function getLoginErrors(
  username: string,
  password: string,
): AuthFieldErrors {
  const errors: AuthFieldErrors = {};
  if (!username.trim() || username.trim().length > AUTH_LIMITS.identifierMax)
    errors.username = 'Vui lòng nhập tên đăng nhập, email hoặc số điện thoại.';
  if (!password) {
    errors.password = 'Vui lòng nhập mật khẩu.';
  } else if (utf8ByteLength(password) > LOGIN_PASSWORD_MAX_BYTES) {
    errors.password = 'Mật khẩu vượt quá giới hạn cho phép.';
  }
  return errors;
}

export function getPasswordStrength(password: string): {
  label: string;
  level: number;
} {
  const groups = [/[A-Za-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(password),
  ).length;
  if (password.length >= 12 && groups >= 3) return { label: 'Mạnh', level: 3 };
  if (password.length >= 8 && groups >= 2) return { label: 'Vừa', level: 2 };
  return { label: 'Yếu', level: 1 };
}
