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
import { StaffLateCancelUseCase } from '../application/staff-late-cancel.use-case.js';
import { StaffLateCancelDto } from './dto/staff-late-cancel.dto.js';

/**
 * D16 — Staff hủy muộn trong [startsAt − 12h, endsAt): tịch thu deposit
 * 30%, hoàn phần verified vượt deposit. STAFF+ theo guard hiện hành.
 */
@ApiBearerAuth()
@Controller('api/staff/bookings')
@UseGuards(JwtAuthGuard, AuthCsrfGuard, RolesGuard)
@Roles(Role.STAFF, Role.MANAGER, Role.ADMIN)
export class StaffBookingsController {
  constructor(private readonly lateCancelUseCase: StaffLateCancelUseCase) {}

  @Post(':id/late-cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'D16 staff: hủy muộn, tịch thu deposit 30%' })
  async lateCancelBooking(
    @CurrentUser('userId') staffUserId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: StaffLateCancelDto,
  ) {
    return {
      success: true,
      data: await this.lateCancelUseCase.execute({
        bookingId: id,
        staffUserId,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
      }),
    };
  }
}
