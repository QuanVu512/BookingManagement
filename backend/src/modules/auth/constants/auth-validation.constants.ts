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
export const PASSWORD_MIN_LENGTH = 7;
export const PASSWORD_LETTER_PATTERN = /\p{L}/u;
export const PASSWORD_MAX_LENGTH = 128;
// Login accepts any non-empty raw password within a fixed byte budget.
// Creation/reset policy (7–128 code points and at least one letter) stays in PASSWORD_* above.
export const LOGIN_PASSWORD_MAX_BYTES = 1024;
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
  'email-otp-delivery': 10 * 60,
  'reset-password': 30 * 60,
} as const;
export const AUTH_RATE_LIMITS = {
  loginIp: { limit: 20, seconds: 60 },
  loginIdentifier: { limit: 5, seconds: 300 },
  registerIp: { limit: 5, seconds: 3600 },
  recoveryIp: { limit: 5, seconds: 60 },
  tokenIp: { limit: 10, seconds: 60 },
  otpVerifyIp: { limit: 20, seconds: 300 },
  otpActivateIp: { limit: 20, seconds: 300 },
} as const;

export const AUTH_OTP = {
  codeDigits: 6,
  ttlSeconds: 300,
  maxAttempts: 5,
  resendCooldownSeconds: 10,
  activationWindowSeconds: 120,
  activationLeaseSeconds: 5,
  activationPerProofPerMinute: 10,
  verifyAccountFailures: 10,
  verifyAccountWindowSeconds: 1800,
} as const;

export const AUTH_OTP_COOKIE_NAME = 'auth_email_verification';
export const AUTH_OTP_COOKIE_PATH = '/api/auth';
export const AUTH_OTP_REDIS_NAMESPACE = 'booking:auth:v2:email-otp';
export const AUTH_OTP_HMAC_SECRET_PATTERN = /^[a-f0-9]{64}$/i;
export const AUTH_OTP_CODE_PATTERN = /^[0-9]{6}$/;
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
  password:
    'Mật khẩu phải dài hơn 6 ký tự, tối đa 128 ký tự và chứa ít nhất một chữ cái.',
  phone: 'Vui lòng nhập số điện thoại Việt Nam hợp lệ dạng 0… hoặc +84….',
  confirmPassword: 'Mật khẩu xác nhận không khớp.',
  loginPassword: 'Vui lòng nhập mật khẩu.',
} as const;

export const AUTH_ERROR_CODES = {
  invalidCredentials: 'INVALID_CREDENTIALS',
  emailVerificationRequired: 'EMAIL_VERIFICATION_REQUIRED',
  invalidLoginInput: 'INVALID_LOGIN_INPUT',
  invalidRegistrationInput: 'INVALID_REGISTRATION_INPUT',
  sessionExpired: 'SESSION_EXPIRED',
  authRateLimited: 'AUTH_RATE_LIMITED',
  authUnavailable: 'AUTH_UNAVAILABLE',
  csrfRejected: 'CSRF_REJECTED',
  accountConflict: 'ACCOUNT_CONFLICT',
} as const;
