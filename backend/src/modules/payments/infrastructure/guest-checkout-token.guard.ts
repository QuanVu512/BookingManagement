import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { GuestTokenService } from './guest-token.service.js';

export const GUEST_CHECKOUT_TOKEN_HEADER = 'x-booking-checkout-token';

/**
 * Contract F2 — guard CheckoutRecoveryToken cho cancel-hold và recovery.
 * Token bind đúng bookingId trên path; purpose CHECKOUT_RECOVERY tách khỏi
 * ManageToken nên không thể dùng để refund/manage (AC-17, AC-18).
 */
@Injectable()
export class GuestCheckoutTokenGuard implements CanActivate {
  constructor(private readonly tokens: GuestTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<
      Request & {
        guestBookingId?: string;
        guestCheckoutTokenId?: string;
      }
    >();
    const bookingId = (request.params as Record<string, string> | undefined)
      ?.bookingId;
    if (typeof bookingId !== 'string' || bookingId.length === 0) {
      throw new UnauthorizedException({
        code: 'CHECKOUT_TOKEN_BOOKING_REQUIRED',
        message: 'Thiếu bookingId cho checkout token.',
      });
    }
    const rawToken = request.header(GUEST_CHECKOUT_TOKEN_HEADER);
    if (!rawToken) {
      throw new UnauthorizedException({
        code: 'CHECKOUT_TOKEN_REQUIRED',
        message: 'Thiếu checkout token.',
      });
    }
    const verified = await this.tokens.verifyCheckoutToken(rawToken, bookingId);
    if (verified.ok) {
      request.guestBookingId = verified.bookingId;
      request.guestCheckoutTokenId = verified.tokenId;
      return true;
    }
    if (verified.reason === 'EXPIRED') {
      throw new UnauthorizedException({
        code: 'RECOVERY_TOKEN_EXPIRED',
        message: 'Liên kết khôi phục đã hết hạn. Vui lòng đặt lại đơn mới.',
      });
    }
    if (verified.reason === 'BOOKING_MISMATCH') {
      throw new ForbiddenException({
        code: 'RECOVERY_TOKEN_BOOKING_MISMATCH',
        message: 'Token không thuộc đơn này.',
      });
    }
    throw new UnauthorizedException({
      code: 'CHECKOUT_TOKEN_INVALID',
      message: 'Checkout token không hợp lệ.',
    });
  }
}
