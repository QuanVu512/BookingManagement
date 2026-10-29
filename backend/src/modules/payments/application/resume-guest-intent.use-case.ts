import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { hashGuestRecoverySecret, safeEqualHex } from '../domain/guest-otp-policy.js';
import { GuestTokenService } from '../infrastructure/guest-token.service.js';
import { GuestCheckoutStore } from '../ports/guest-checkout-store.js';
import type { GuestHoldResult } from './guest-create-hold.use-case.js';

export interface ResumeGuestIntentInput {
  checkoutIntentId: string;
  recoverySecret: string;
}

const GUEST_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Task 2.2 — resume-intent: xác thực recoverySecret rồi cấp lại
 * CheckoutRecoveryToken với hạn cố định từ hold gốc (không gia hạn).
 * Không tạo booking/occupancy mới, không đòi OTP proof còn hạn.
 */
@Injectable()
export class ResumeGuestIntentUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guestStore: GuestCheckoutStore,
    private readonly tokens: GuestTokenService,
  ) {}

  async execute(input: ResumeGuestIntentInput): Promise<GuestHoldResult> {
    // checkoutIntentId là PK uuid trong DB; chặn sớm để không lộ lỗi Prisma.
    if (!GUEST_UUID_PATTERN.test(input.checkoutIntentId)) {
      throw new BadRequestException({
        code: 'INVALID_CHECKOUT_INTENT_ID',
        message: 'checkoutIntentId phải là UUID.',
      });
    }
    const intent = await this.guestStore.findIntentById(input.checkoutIntentId);
    if (!intent) {
      // Generic: không xác nhận intent có tồn tại hay không.
      throw new NotFoundException({
        code: 'CHECKOUT_INTENT_NOT_FOUND',
        message: 'Không tìm thấy đơn giữ chỗ để khôi phục.',
      });
    }
    const secretHash = hashGuestRecoverySecret(input.recoverySecret);
    if (!safeEqualHex(intent.recoverySecretHash, secretHash)) {
      throw new ForbiddenException({
        code: 'RECOVERY_SECRET_INVALID',
        message: 'Khóa khôi phục không hợp lệ.',
      });
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: intent.bookingId },
    });
    if (!booking) {
      throw new NotFoundException({
        code: 'CHECKOUT_INTENT_BOOKING_MISSING',
        message: 'Không tìm thấy đơn giữ chỗ để khôi phục.',
      });
    }
    if (booking.userId !== null) {
      throw new ConflictException({
        code: 'GUEST_BOOKING_REQUIRED',
        message: 'Đơn này thuộc tài khoản thành viên, không dùng khôi phục khách.',
      });
    }

    let checkout: { rawToken: string; expiresAt: Date };
    try {
      checkout = await this.tokens.issueCheckoutToken({
        bookingId: booking.id,
        holdIssuedAt: booking.createdAt,
      });
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) throw error;
      throw error;
    }
    const now = await this.guestStore.databaseNow();

    return {
      bookingId: booking.id,
      bookingCode: booking.bookingCode,
      holdExpiresAt: booking.holdExpiresAt.toISOString(),
      totalAmount: Number(booking.totalAmount.toString()),
      prepaymentAmount: Number(booking.requiredPrepaymentAmount.toString()),
      accessToken: '',
      accessTokenExpiresAt: '',
      checkoutToken: checkout.rawToken,
      checkoutTokenExpiresAt: checkout.expiresAt.toISOString(),
      checkoutIntentId: intent.checkoutIntentId,
      serverNow: now.toISOString(),
    };
  }
}
