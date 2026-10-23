import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { UserStatus } from '../../../enums/index.js';
import {
  AUTH_OTP,
  AUTH_OTP_HMAC_SECRET_PATTERN,
  AUTH_OTP_REDIS_NAMESPACE,
  AUTH_RANDOM_TOKEN_BYTES,
} from '../constants/auth-validation.constants.js';
import { authError } from '../helpers/auth-error.js';
import { AuthMailService } from './auth-mail.service.js';
import { AuthRateLimitService } from './auth-rate-limit.service.js';
import { AuthRedisStore } from './auth-redis.store.js';

export type EmailOtpState =
  | 'ISSUED'
  | 'VERIFIED_PENDING_ACTIVATION'
  | 'ACTIVATING'
  | 'ACTIVATED'
  | 'EXHAUSTED'
  | 'EXPIRED'
  | 'INVALID';

export interface EmailOtpRecord {
  challengeId: string;
  userId: string;
  email: string;
  tokenVersion: number;
  generation: number;
  status: EmailOtpState;
  expiresAt: number;
  attempts: number;
  codeHash: string;
  activationDeadline?: number;
  activationLease?: number;
}

export interface EmailOtpIssuance {
  token: string;
  challengeId: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
  delivered: boolean;
}

export interface EmailOtpVerification {
  status: 'verified';
  activationExpiresInSeconds: number;
}

export const OTP_VERIFY_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {-1} end
local r = cjson.decode(raw)
local now = tonumber(redis.call('TIME')[1])
if r.challengeId ~= ARGV[1] then return {-1} end
if r.status == 'VERIFIED_PENDING_ACTIVATION' or r.status == 'ACTIVATING' then return {-4} end
if r.status ~= 'ISSUED' then return {-1} end
if now >= tonumber(r.expiresAt) then return {-1} end
if tonumber(r.attempts) >= tonumber(ARGV[4]) then return {-3} end
if r.codeHash ~= ARGV[2] then
  r.attempts = tonumber(r.attempts) + 1
  local exhausted = 0
  if r.attempts >= tonumber(ARGV[4]) then r.status = 'EXHAUSTED'; exhausted = 1 end
  redis.call('SET', KEYS[1], cjson.encode(r), 'KEEPTTL')
  return {0, r.attempts, exhausted}
end
r.status = 'VERIFIED_PENDING_ACTIVATION'
r.codeHash = ''
r.activationDeadline = now + tonumber(ARGV[3])
redis.call('SET', KEYS[1], cjson.encode(r), 'KEEPTTL')
return {1, r.attempts}
`;

export const OTP_ACTIVATION_CLAIM_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {-1} end
local r = cjson.decode(raw)
local now = tonumber(redis.call('TIME')[1])
if r.challengeId ~= ARGV[1] then return {-1} end
if r.status == 'ACTIVATED' then return {3} end
if r.status == 'VERIFIED_PENDING_ACTIVATION' then
  if now > tonumber(r.activationDeadline) then
    r.status = 'EXPIRED'
    redis.call('SET', KEYS[1], cjson.encode(r), 'KEEPTTL')
    return {-2}
  end
  r.status = 'ACTIVATING'
  r.activationLease = now + tonumber(ARGV[2])
  redis.call('SET', KEYS[1], cjson.encode(r), 'KEEPTTL')
  return {1}
end
if r.status == 'ACTIVATING' then
  if now <= tonumber(r.activationLease) then return {1} end
  if now <= tonumber(r.activationDeadline) then
    r.activationLease = now + tonumber(ARGV[2])
    redis.call('SET', KEYS[1], cjson.encode(r), 'KEEPTTL')
    return {1}
  end
  return {-2}
end
return {-1}
`;

export const OTP_MARK_ACTIVATED_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local r = cjson.decode(raw)
if r.challengeId ~= ARGV[1] then return 0 end
if r.status ~= 'ACTIVATING' and r.status ~= 'ACTIVATED' then return 0 end
r.status = 'ACTIVATED'
r.codeHash = ''
r.activationDeadline = nil
r.activationLease = nil
redis.call('SET', KEYS[1], cjson.encode(r), 'KEEPTTL')
return 1
`;

export const OTP_FAILURE_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then redis.call('EXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return {count, ttl}
`;

/**
 * RF-03A — email OTP primitives and two-stage verification proof.
 * The OTP code is never stored in plaintext; a 120s VERIFIED_PENDING_ACTIVATION
 * proof allows DB retries after the code has already been consumed.
 */
@Injectable()
export class EmailOtpService {
  private readonly logger = new Logger(EmailOtpService.name);
  private readonly enabled: boolean;
  private readonly secret: Buffer | null;

  constructor(
    private readonly store: AuthRedisStore,
    private readonly prisma: PrismaService,
    private readonly mail: AuthMailService,
    private readonly limiter: AuthRateLimitService,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('EMAIL_OTP_ENABLED') !== 'false';
    const secret =
      config.get<string>('AUTH_OTP_HMAC_SECRET') ??
      config.get<string>('JWT_SECRET') ??
      '';
    if (this.enabled && !AUTH_OTP_HMAC_SECRET_PATTERN.test(secret)) {
      throw new Error(
        'AUTH_OTP_HMAC_SECRET must be 64 hexadecimal characters when EMAIL_OTP_ENABLED=true.',
      );
    }
    this.secret = this.enabled
      ? createHmac('sha256', Buffer.from(secret, 'hex'))
          .update('booking:email-otp:key:v1')
          .digest()
      : null;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Issues a fresh challenge for a verified-eligible account. */
  async issue(
    account: {
      id: string;
      email: string;
      tokenVersion: number;
    },
    existingToken?: string,
  ): Promise<EmailOtpIssuance> {
    this.assertEnabled();
    const allowed = await this.limiter.reserveRecipient(
      account.email,
      'email-otp',
    );
    const issuance = this.createRecord(account, 1);
    if (!allowed) {
      // Generic shape and timing without delivering; no account disclosure.
      return { ...this.publicPart(issuance), delivered: false };
    }
    const code = randomInt(0, 10 ** AUTH_OTP.codeDigits)
      .toString()
      .padStart(AUTH_OTP.codeDigits, '0');
    const record = {
      ...issuance.record,
      codeHash: this.hashCode(
        issuance.challengeId,
        code,
        account,
        issuance.record.generation,
      ),
    };
    // A single account key replaces the previous challenge across browsers/tabs.
    const token = existingToken ?? this.emailToken(account.email);
    await this.store.set(
      this.key(token),
      JSON.stringify(record),
      AUTH_OTP.ttlSeconds,
    );
    await this.mail.sendEmailOtp(account.email, code);
    return {
      token,
      challengeId: record.challengeId,
      expiresInSeconds: AUTH_OTP.ttlSeconds,
      resendAfterSeconds: AUTH_OTP.resendCooldownSeconds,
      delivered: true,
    };
  }

  async verifyEmail(email: string, code: string): Promise<void> {
    const token = this.emailToken(email);
    const record = await this.readRecord(token);
    if (!record || record.status !== 'ISSUED') throw this.invalid();
    await this.verify(token, record.challengeId, code);
    await this.activate(token, record.challengeId);
  }

  private emailToken(email: string): string {
    this.assertEnabled();
    if (!this.secret) throw this.disabled();
    return createHmac('sha256', this.secret)
      .update(
        JSON.stringify([
          'email-verification-account',
          email.trim().toLowerCase(),
        ]),
      )
      .digest('hex');
  }

  /**
   * Generic resend: existing pending proofs are preserved; unknown/disabled/
   * verified recipients receive a dummy challenge with the same public shape.
   */
  async resendForEmail(
    email: string,
    existingToken?: string,
  ): Promise<EmailOtpIssuance> {
    this.assertEnabled();
    if (existingToken) {
      const pending = await this.readRecord(existingToken);
      if (
        pending &&
        (pending.status === 'VERIFIED_PENDING_ACTIVATION' ||
          pending.status === 'ACTIVATING')
      ) {
        return {
          token: existingToken,
          challengeId: pending.challengeId,
          expiresInSeconds: AUTH_OTP.ttlSeconds,
          resendAfterSeconds: AUTH_OTP.resendCooldownSeconds,
          delivered: false,
        };
      }
    }
    const user = await this.prisma.user.findUnique({ where: { email } });
    const eligible =
      user && user.status === UserStatus.ACTIVE && !user.emailVerifiedAt;
    if (!eligible || !user) {
      await this.limiter.reserveRecipient(email, 'email-otp');
      const dummy = this.createRecord(
        { id: 'dummy', email, tokenVersion: 0 },
        1,
      );
      return { ...this.publicPart(dummy), delivered: false };
    }
    return this.issue(
      { id: user.id, email: user.email, tokenVersion: user.tokenVersion },
      existingToken,
    );
  }

  async verify(
    token: string,
    challengeId: string,
    code: string,
  ): Promise<EmailOtpVerification> {
    this.assertEnabled();
    const record = await this.readRecord(token);
    if (!record) throw this.invalid();
    await this.assertAccountBudget(record.email);
    const expected = this.hashCode(
      challengeId,
      code,
      {
        id: record.userId,
        email: record.email,
        tokenVersion: record.tokenVersion,
      },
      record.generation,
    );
    const result = await this.store.evaluate(
      OTP_VERIFY_SCRIPT,
      this.key(token),
      [
        challengeId,
        expected,
        String(AUTH_OTP.activationWindowSeconds),
        String(AUTH_OTP.maxAttempts),
      ],
    );
    const outcome = Array.isArray(result) ? Number(result[0]) : -1;
    if (outcome === 1) {
      return {
        status: 'verified',
        activationExpiresInSeconds: AUTH_OTP.activationWindowSeconds,
      };
    }
    await this.countFailure(record.email);
    if (outcome === -3) throw this.exhausted();
    if (outcome === 0 && Array.isArray(result) && Number(result[2]) === 1) {
      throw this.exhausted();
    }
    throw this.invalid();
  }

  /**
   * Retries DB activation using only the pending proof + challengeId.
   * Never accepts a new OTP code and never extends the 120s window.
   */
  async activate(
    token: string,
    challengeId: string,
  ): Promise<{ status: 'verified'; idempotent: boolean }> {
    this.assertEnabled();
    await this.assertActivationBudget(token);
    const claimed = await this.store.evaluate(
      OTP_ACTIVATION_CLAIM_SCRIPT,
      this.key(token),
      [challengeId, String(AUTH_OTP.activationLeaseSeconds)],
    );
    const claim = Array.isArray(claimed) ? Number(claimed[0]) : -1;
    if (claim === -2) throw this.expired();
    if (claim === -1) throw this.invalid();
    const record = await this.readRecord(token);
    if (!record || record.challengeId !== challengeId) throw this.invalid();
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        record.userId,
      )
    ) {
      throw this.invalid();
    }
    if (record.status === 'ACTIVATED' || claim === 3) {
      return { status: 'verified', idempotent: true };
    }
    let idempotent = false;
    try {
      idempotent = await this.activateInDatabase(record);
    } catch (error) {
      if ((error as { code?: string })?.code === 'OTP_STALE') {
        throw this.invalid();
      }
      this.logger.warn('OTP activation database unavailable.');
      throw authError(
        503,
        'OTP_ACTIVATION_PENDING',
        'Mã đã được sử dụng nhưng chưa thể kích hoạt tài khoản. Vui lòng yêu cầu mã mới rồi thử lại.',
      );
    }
    await this.store
      .evaluate(OTP_MARK_ACTIVATED_SCRIPT, this.key(token), [challengeId])
      .catch(() => this.logger.warn('OTP activation finalize unavailable.'));
    return { status: 'verified', idempotent };
  }

  async status(token: string): Promise<{
    status: EmailOtpState;
    expiresInSeconds: number;
    activationRetrySeconds: number;
  }> {
    this.assertEnabled();
    const record = await this.readRecord(token);
    if (!record) throw this.invalid();
    const now = Math.floor(Date.now() / 1000);
    return {
      status: record.status,
      expiresInSeconds: Math.max(0, record.expiresAt - now),
      activationRetrySeconds:
        record.activationDeadline != null
          ? Math.max(0, record.activationDeadline - now)
          : 0,
    };
  }

  private async activateInDatabase(record: EmailOtpRecord): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<
        Array<{
          id: string;
          email: string;
          token_version: number;
          status: UserStatus;
          email_verified_at: Date | null;
        }>
      >`SELECT id, email, token_version, status, email_verified_at
        FROM users WHERE id = ${record.userId}::uuid FOR UPDATE`;
      const user = rows[0];
      if (
        !user ||
        user.email !== record.email ||
        user.token_version !== record.tokenVersion ||
        user.status !== UserStatus.ACTIVE
      ) {
        const staleError = new Error('OTP stale');
        (staleError as { code?: string }).code = 'OTP_STALE';
        throw staleError;
      }
      if (user.email_verified_at) return true;
      await transaction.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      });
      return false;
    });
  }

  private async assertAccountBudget(email: string): Promise<void> {
    const key = `${AUTH_OTP_REDIS_NAMESPACE}:failures:account:${this.hash(email.toLowerCase())}`;
    const raw = await this.store.get(key);
    const count = Number(raw ?? 0);
    if (Number.isFinite(count) && count >= AUTH_OTP.verifyAccountFailures) {
      throw authError(
        429,
        'AUTH_RATE_LIMITED',
        'Quá nhiều lần xác minh không thành công. Vui lòng thử lại sau.',
      );
    }
  }

  private async countFailure(email: string): Promise<void> {
    const key = `${AUTH_OTP_REDIS_NAMESPACE}:failures:account:${this.hash(email.toLowerCase())}`;
    await this.store.evaluate(OTP_FAILURE_SCRIPT, key, [
      String(AUTH_OTP.verifyAccountWindowSeconds),
    ]);
  }

  private async assertActivationBudget(token: string): Promise<void> {
    const key = `${AUTH_OTP_REDIS_NAMESPACE}:activation:${this.hash(token)}`;
    const result = await this.store.evaluate(OTP_FAILURE_SCRIPT, key, ['60']);
    if (
      Array.isArray(result) &&
      Number(result[0]) > AUTH_OTP.activationPerProofPerMinute
    ) {
      throw authError(
        429,
        'AUTH_RATE_LIMITED',
        'Quá nhiều lần thử kích hoạt. Vui lòng thử lại sau.',
      );
    }
  }

  private createRecord(
    account: { id: string; email: string; tokenVersion: number },
    generation: number,
  ): { token: string; challengeId: string; record: EmailOtpRecord } {
    const token = randomBytes(AUTH_RANDOM_TOKEN_BYTES).toString('hex');
    const challengeId = randomBytes(AUTH_RANDOM_TOKEN_BYTES).toString('hex');
    return {
      token,
      challengeId,
      record: {
        challengeId,
        userId: account.id,
        email: account.email,
        tokenVersion: account.tokenVersion,
        generation,
        status: 'ISSUED',
        expiresAt: Math.floor(Date.now() / 1000) + AUTH_OTP.ttlSeconds,
        attempts: 0,
        codeHash: '',
      },
    };
  }

  private publicPart(issuance: {
    token: string;
    challengeId: string;
  }): Omit<EmailOtpIssuance, 'delivered'> {
    return {
      token: issuance.token,
      challengeId: issuance.challengeId,
      expiresInSeconds: AUTH_OTP.ttlSeconds,
      resendAfterSeconds: AUTH_OTP.resendCooldownSeconds,
    };
  }

  private hashCode(
    challengeId: string,
    code: string,
    account: { id: string; email: string; tokenVersion: number },
    generation: number,
  ): string {
    if (!this.secret) throw this.disabled();
    // Fixed-order JSON array: [purpose, challengeId, userId, email, tokenVersion, generation, code]
    const input = JSON.stringify([
      'email-otp',
      challengeId,
      account.id,
      account.email,
      account.tokenVersion,
      String(generation),
      code,
    ]);
    return createHmac('sha256', this.secret).update(input).digest('hex');
  }

  private async readRecord(token: string): Promise<EmailOtpRecord | null> {
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const raw = await this.store.get(this.key(token));
    if (!raw) return null;
    try {
      const value: unknown = JSON.parse(raw);
      if (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as EmailOtpRecord).challengeId === 'string' &&
        typeof (value as EmailOtpRecord).email === 'string'
      ) {
        return value as EmailOtpRecord;
      }
    } catch {
      /* Corrupted records fail closed. */
    }
    return null;
  }

  private key(token: string): string {
    return `${AUTH_OTP_REDIS_NAMESPACE}:challenge:${this.hash(token)}`;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private assertEnabled(): void {
    if (!this.enabled) throw this.disabled();
  }

  private disabled() {
    return authError(
      503,
      'OTP_DISABLED',
      'Xác minh email bằng mã tạm thời chưa được bật.',
    );
  }

  private invalid() {
    return authError(
      400,
      'OTP_INVALID_OR_EXPIRED',
      'Mã xác minh không hợp lệ hoặc đã hết hạn.',
    );
  }

  private exhausted() {
    return authError(
      400,
      'OTP_ATTEMPTS_EXHAUSTED',
      'Bạn đã nhập sai quá số lần cho phép. Vui lòng gửi lại mã mới.',
    );
  }

  private expired() {
    return authError(
      400,
      'OTP_INVALID_OR_EXPIRED',
      'Phiên xác minh đã hết hạn. Vui lòng gửi lại mã mới.',
    );
  }
}
