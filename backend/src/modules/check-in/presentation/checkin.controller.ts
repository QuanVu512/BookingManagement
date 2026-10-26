import {
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { AuthCsrfGuard } from '../../auth/guards/auth-csrf.guard.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { MintCheckinTokenUseCase } from '../application/mint-checkin-token.use-case.js';

/**
 * C10 member — cấp mã QR check-in cho đơn CONFIRMED của chính mình.
 * Fail-closed 503 khi cửa sổ D02 chưa cấu hình.
 */
@ApiBearerAuth()
@Controller('api/bookings')
@UseGuards(JwtAuthGuard, AuthCsrfGuard)
export class CheckinController {
  constructor(private readonly mint: MintCheckinTokenUseCase) {}

  @Post(':id/check-in-token')
  @HttpCode(201)
  @ApiOperation({ summary: 'C10: cấp mã QR check-in cho đơn của mình' })
  async mintToken(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.mint.execute({
      bookingId: id,
      actorUserId: userId,
      actorType: 'CUSTOMER',
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
