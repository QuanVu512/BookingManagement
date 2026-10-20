import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { GuestTokenService } from './guest-token.service.js';

export const GUEST_TOKEN_HEADER = 'x-booking-access-token';

/**
 * E3 — Guest token guard (MIG-11, MIG-12, D-09).
 * Token qua header `X-Booking-Access-Token` (không qua query URL để tránh
 * rò rỉ qua log/referrer). Gắn bookingId đã bind; cross-booking bị chặn.
 * Guest-token-only request không yêu cầu CSRF (stateless, không cookie).
 */
@Injectable()
export class GuestTokenGuard implements CanActivate {
  constructor(private readonly tokens: GuestTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { guestBookingId?: string }>();
    const bookingId =
      (request.params as Record<string, string> | undefined)?.bookingId ??
      (request.query as Record<string, string> | undefined)?.bookingId ??
      (typeof request.body === 'object' && request.body !== null
        ? ((request.body as Record<string, unknown>).bookingId as string | undefined)
        : undefined);
    if (typeof bookingId !== 'string' || bookingId.length === 0) {
      throw new UnauthorizedException('Thiếu bookingId cho guest token.');
    }
    const rawToken = request.header(GUEST_TOKEN_HEADER);
    if (!rawToken) throw new UnauthorizedException('Thiếu guest token.');
    const verified = await this.tokens.verifyManageToken(rawToken, bookingId);
    if (!verified) throw new UnauthorizedException('Guest token không hợp lệ.');
    request.guestBookingId = verified.bookingId;
    return true;
  }
}
