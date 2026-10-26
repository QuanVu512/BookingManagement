import {
  Body,
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
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Role } from '../../../enums/index.js';
import { VerifyCheckinUseCase } from '../application/verify-checkin.use-case.js';
import { ManualCheckinUseCase } from '../application/manual-checkin.use-case.js';
import { CompleteBookingUseCase } from '../application/complete-booking.use-case.js';
import {
  ManualCheckinDto,
  VerifyCheckinDto,
} from './checkin-request.dto.js';

/**
 * C10/C11 staff — quét QR / thủ công / hoàn tất. STAFF+ theo guard hiện
 * hành (chi tiết least-privilege chờ D08). Mọi transition ghi actor STAFF.
 */
@ApiBearerAuth()
@Controller('api/staff')
@UseGuards(JwtAuthGuard, AuthCsrfGuard, RolesGuard)
@Roles(Role.STAFF, Role.MANAGER, Role.ADMIN)
export class StaffCheckinsController {
  constructor(
    private readonly verify: VerifyCheckinUseCase,
    private readonly manual: ManualCheckinUseCase,
    private readonly complete: CompleteBookingUseCase,
  ) {}

  @Post('check-ins/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'C10 staff: quét mã QR check-in' })
  async verifyQr(
    @CurrentUser('userId') staffUserId: string,
    @Body() input: VerifyCheckinDto,
  ) {
    return {
      success: true,
      data: await this.verify.execute({
        bookingId: input.bookingId,
        rawToken: input.token,
        staffUserId,
      }),
    };
  }

  @Post('check-ins/manual')
  @HttpCode(200)
  @ApiOperation({ summary: 'C10 staff: check-in thủ công có ghi chú' })
  async manualCheckin(
    @CurrentUser('userId') staffUserId: string,
    @Body() input: ManualCheckinDto,
  ) {
    return {
      success: true,
      data: await this.manual.execute({
        bookingId: input.bookingId,
        staffUserId,
        note: input.note,
      }),
    };
  }

  @Post('bookings/:id/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'C11 staff: hoàn tất đơn đã check-in hết giờ' })
  async completeBooking(
    @CurrentUser('userId') staffUserId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return {
      success: true,
      data: await this.complete.execute({
        bookingId: id,
        actorUserId: staffUserId,
        actorType: 'STAFF',
      }),
    };
  }
}
