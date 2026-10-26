import {
  Body,
  Controller,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';
import { GuestTokenGuard } from '../../payments/infrastructure/guest-token.guard.js';
import { RequestPaidCancellationUseCase } from '../application/request-paid-cancellation.use-case.js';
import { ApplyPaidCancellationUseCase } from '../application/apply-paid-cancellation.use-case.js';
import {
  ApplyCancelDto,
  RequestCancelQuoteDto,
} from './dto/cancel-request.dto.js';

/**
 * C08 guest — báo phí + áp dụng hủy qua scoped MANAGE_BOOKING token
 * (header, không cookie/CSRF). Param :bookingId để GuestTokenGuard bind.
 */
@Controller('api/guest/bookings/:bookingId')
@UseGuards(GuestTokenGuard)
export class GuestCancellationController {
  constructor(
    private readonly requestCancelQuote: RequestPaidCancellationUseCase,
    private readonly applyCancel: ApplyPaidCancellationUseCase,
  ) {}

  @Post('cancel-quote')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'C08 guest: báo phí hủy có hoàn' })
  async cancelQuote(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() input: RequestCancelQuoteDto,
    @Req() request: Request & { guestBookingId?: string },
  ) {
    const quote = await this.requestCancelQuote.execute({
      bookingId,
      actorUserId: null,
      actorType: 'GUEST',
      guestBookingId: request.guestBookingId,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
    });
    return {
      success: true,
      data: { ...quote, expiresAt: quote.expiresAt.toISOString() },
    };
  }

  @Post('cancel-apply')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'C08 guest: áp dụng hủy có hoàn' })
  async cancelApply(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() input: ApplyCancelDto,
    @Req() request: Request & { guestBookingId?: string },
  ) {
    return {
      success: true,
      data: await this.applyCancel.execute({
        bookingId,
        quoteId: input.quoteId,
        accepted: input.accepted,
        actorUserId: null,
        actorType: 'GUEST',
        guestBookingId: request.guestBookingId,
        idempotencyKey: input.idempotencyKey,
      }),
    };
  }
}
