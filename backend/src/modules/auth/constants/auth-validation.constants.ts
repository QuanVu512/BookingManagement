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
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const USERNAME_PATTERN = /^(?=.*[A-Za-z])[A-Za-z0-9]+$/;
export const VIETNAM_PHONE_INPUT_PATTERN = /^(?:0|\+84)[0-9]+$/;
export const AUTH_COOKIE_NAME = 'access_token';
export const AUTH_TOKEN_TTL = '15m';
export const AUTH_JWT_ISSUER = 'booking-api';
export const AUTH_JWT_AUDIENCE = 'booking-web';
export const AUTH_COOKIE_MAX_AGE_MS = 15 * 60 * 1000;
export const AUTH_JWT_SECRET_PATTERN = /^[a-f0-9]{64}$/i;
export const AUTH_JWT_SECRET_MIN_DISTINCT_CHARACTERS = 8;
export const AUTH_REDIS_NAMESPACE = 'booking:auth:v1';
export const AUTH_RANDOM_TOKEN_BYTES = 32;
export const AUTH_RANDOM_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
export const AUTH_CSRF_COOKIE_NAME = 'auth_csrf_context';
export const AUTH_CSRF_HEADER_NAME = 'x-csrf-token';
export const AUTH_CSRF_TTL_SECONDS = 30 * 60;
export const AUTH_MAIL_TIMEOUT_MS = 2500;
export const AUTH_MAIL_CONNECT_TIMEOUT_MS = 1000;
export const AUTH_RECOVERY_RESPONSE_MS = 3500;
export const AUTH_ONE_TIME_TTLS = {
  'verify-email': 24 * 60 * 60,
  'reset-password': 30 * 60,
} as const;
export const AUTH_RATE_LIMITS = {
  loginIp: { limit: 20, seconds: 60 },
  loginIdentifier: { limit: 5, seconds: 300 },
  registerIp: { limit: 5, seconds: 3600 },
  recoveryIp: { limit: 5, seconds: 60 },
  tokenIp: { limit: 10, seconds: 60 },
} as const;
export const AUTH_RECIPIENT_LIMIT = {
  limit: 3,
  seconds: 3600,
  cooldown: 60,
} as const;
export const AUTH_RECOVERY_CONCURRENCY = 4;
export const AUTH_HASH_CONCURRENCY = 4;
// Offline-generated random password; same Argon2id policy as new accounts.
export const AUTH_DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$HggKGR7+HCaKIYXyD4g1aA$C6xi/10qxaZ0mtarIqvmTSXz2xN03KpFySmzFO9cwAI';
export const AUTH_REGISTRATION_MESSAGE =
  'Nếu thông tin phù hợp, hướng dẫn xác minh sẽ được gửi qua email. Nếu chưa nhận được, hãy dùng chức năng gửi lại hoặc kiểm tra thông tin đăng ký.';
export const PASSWORD_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
export const PASSWORD_RANGE_TIMEOUT_MS = 3000;
export const PASSWORD_RANGE_MAX_RESPONSE_BYTES = 1024 * 1024;

export const AUTH_VALIDATION_MESSAGES = {
  username: 'Tên đăng nhập cần ít nhất 8 ký tự, phải có ít nhất 1 chữ cái',
  password: 'Mật khẩu cần 12–128 ký tự; hỗ trợ Unicode và khoảng trắng.',
  phone: 'Vui lòng nhập số điện thoại Việt Nam hợp lệ dạng 0… hoặc +84….',
  confirmPassword: 'Mật khẩu xác nhận không khớp.',
} as const;
