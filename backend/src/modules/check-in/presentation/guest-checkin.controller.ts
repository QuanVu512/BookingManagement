import {
  Controller,
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
import { MintCheckinTokenUseCase } from '../application/mint-checkin-token.use-case.js';

/**
 * C10 guest — cấp mã QR qua scoped MANAGE_BOOKING token (header).
 * Param :bookingId để GuestTokenGuard bind.
 */
@Controller('api/guest/bookings/:bookingId')
@UseGuards(GuestTokenGuard)
export class GuestCheckinController {
  constructor(private readonly mint: MintCheckinTokenUseCase) {}

  @Post('check-in-token')
  @HttpCode(201)
  @ApiOperation({ summary: 'C10 guest: cấp mã QR check-in' })
  async mintToken(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Req() request: Request & { guestBookingId?: string },
  ) {
    const result = await this.mint.execute({
      bookingId,
      actorUserId: null,
      actorType: 'GUEST',
      guestBookingId: request.guestBookingId,
    });
    return {
      success: true,
      data: {
        ...result,
        expiresAt: result.expiresAt.toISOString(),
      },
    };
  }
}
