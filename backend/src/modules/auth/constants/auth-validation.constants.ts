// Storage limits from User and UserProfile in prisma/schema.prisma.
export const AUTH_FIELD_MAX_LENGTH = {
  username: 100,
  email: 254,
  phone: 20,
  fullName: 150,
} as const;

// Login accepts username, email, or phone in the same field.
export const LOGIN_IDENTIFIER_MAX_LENGTH = AUTH_FIELD_MAX_LENGTH.email;

export const USERNAME_MIN_LENGTH = 8;
export const PASSWORD_MIN_LENGTH = 6;
export const USERNAME_PATTERN = /^(?=.*[A-Za-z])[A-Za-z0-9]+$/;
export const PASSWORD_PATTERN = /^[\x21-\x7e]+$/;
export const VIETNAM_PHONE_INPUT_PATTERN = /^(?:0|\+84)[0-9]+$/;
export const AUTH_COOKIE_NAME = 'access_token';
export const AUTH_TOKEN_TTL = '7d';
export const AUTH_DEV_JWT_SECRET = 'dev-secret-key-change-in-production-12345';
export const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const AUTH_VALIDATION_MESSAGES = {
  username: 'Tên đăng nhập cần ít nhất 8 ký tự, phải có ít nhất 1 chữ cái',
  password:
    'Mật khẩu cần ít nhất 6 ký tự, chỉ gồm chữ số, ký hiệu và không có khoảng trắng.',
  phone: 'Vui lòng nhập số điện thoại Việt Nam hợp lệ dạng 0… hoặc +84….',
  confirmPassword: 'Mật khẩu xác nhận không khớp.',
} as const;
