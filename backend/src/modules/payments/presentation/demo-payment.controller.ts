import {
  Body,
  Controller,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { AuthCsrfGuard } from '../../auth/guards/auth-csrf.guard.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { GuestTokenGuard } from '../infrastructure/guest-token.guard.js';
import { SimulateDemoPaymentUseCase } from '../application/simulate-demo-payment.use-case.js';
import { SimulateDemoPaymentDto } from './dto/simulate-demo-payment.dto.js';

/**
 * BE-PAY-DEMO — Controller mô phỏng thanh toán showcase (F01 review).
 * - TÁCH RIÊNG khỏi webhook receiver public: receiver giữ HMAC-only, không
 *   JWT; simulator yêu cầu quyền chủ đơn đầy đủ.
 * - Member: JWT + CSRF; use case authorize owner qua booking.userId.
 * - Guest: scoped token qua header + bookingId trong body; cross-booking
 *   trả 401/404, không bao giờ ghi tiền cho đơn khác.
 * - no-store mọi response tiền; audit DEMO trong use case, không log secret.
 */
@Controller('api/payments')
@UseGuards(JwtAuthGuard, AuthCsrfGuard)
@ApiBearerAuth()
export class MemberDemoPaymentsController {
  constructor(private readonly simulate: SimulateDemoPaymentUseCase) {}

  @Post('requests/:id/simulate')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'DEMO showcase: mô phỏng thanh toán thành công' })
  async simulateForMember(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.simulate.execute(id, {
      userId,
      actorUserId: userId,
    });
    return { success: true, data: result };
  }
}

@Controller('api/guest/payments')
@UseGuards(GuestTokenGuard)
export class GuestDemoPaymentsController {
  constructor(private readonly simulate: SimulateDemoPaymentUseCase) {}

  @Post('requests/:id/simulate')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({
    summary: 'DEMO showcase cho khách vãng lai: mô phỏng thanh toán',
  })
  async simulateForGuest(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SimulateDemoPaymentDto,
  ) {
    if (typeof body.bookingId !== 'string' || body.bookingId.length === 0) {
      throw new UnauthorizedException('Thiếu bookingId cho guest token.');
    }
    const guestBookingId = (request as Request & { guestBookingId?: string })
      .guestBookingId;
    const result = await this.simulate.execute(id, {
      userId: null,
      guestBookingId,
      actorUserId: null,
    });
    return { success: true, data: result };
  }
}
