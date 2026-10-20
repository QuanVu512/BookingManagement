import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { AuthCsrfGuard } from '../../auth/guards/auth-csrf.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Role } from '../../../enums/index.js';
import { StaffRefundsUseCase } from '../application/staff-refunds.use-case.js';
import {
  RefundApproveDto,
  RefundReconcileDto,
  RefundRejectDto,
} from './dto/payment-request.dto.js';

/**
 * E17/E18/E19/E21/E22 — Staff refund operations (MIG-04, MIG-16).
 * E18/E19/E22: STAFF+MANAGER+ADMIN; E17 list + E21 reveal: MANAGER/ADMIN
 * (reveal PII đích cần phê duyệt cao hơn).
 */
@Controller('api/staff/refunds')
@UseGuards(JwtAuthGuard, AuthCsrfGuard, RolesGuard)
@ApiBearerAuth()
export class StaffRefundsController {
  constructor(private readonly refunds: StaffRefundsUseCase) {}

  @Get()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'E17: list refunds (masked)' })
  async list(
    @Query('status') status?: string,
    @Query('bookingId', new ParseUUIDPipe({ optional: true }))
    bookingId?: string,
  ) {
    return { success: true, data: await this.refunds.list({ status, bookingId }) };
  }

  @Post(':id/approve')
  @Roles(Role.STAFF, Role.MANAGER, Role.ADMIN)
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'E18: approve refund (four-eyes)' })
  async approve(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: RefundApproveDto,
  ) {
    const result = await this.refunds.approve({
      refundId: id,
      note: input.note,
      idempotencyKey: input.idempotencyKey,
      approverUserId: userId,
      destination:
        input.destinationBankBin &&
        input.destinationAccountLast4 &&
        input.destinationAccountName
          ? {
              bankBin: input.destinationBankBin,
              accountLast4: input.destinationAccountLast4,
              accountName: input.destinationAccountName,
              accountNumber: input.destinationAccountNumber,
            }
          : undefined,
    });
    return { success: true, data: result };
  }

  @Post(':id/reject')
  @Roles(Role.STAFF, Role.MANAGER, Role.ADMIN)
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'E19: reject refund (chặn attempt live)' })
  async reject(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: RefundRejectDto,
  ) {
    const result = await this.refunds.reject({
      refundId: id,
      rejectionReason: input.rejectionReason,
      idempotencyKey: input.idempotencyKey,
      actorUserId: userId,
    });
    return { success: true, data: result };
  }

  @Get(':id/destination')
  @Roles(Role.MANAGER, Role.ADMIN)
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'E21: reveal destination (audit)' })
  async reveal(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.refunds.reveal({
      refundId: id,
      actorUserId: userId,
    });
    return { success: true, data: result };
  }

  @Post(':id/reconcile')
  @Roles(Role.STAFF, Role.MANAGER, Role.ADMIN)
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'E22: reconcile refund manual (unlock UNKNOWN)' })
  async reconcile(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: RefundReconcileDto,
  ) {
    const result = await this.refunds.reconcile({
      refundId: id,
      bankTransactionReference: input.bankTransactionReference,
      evidenceReference: input.evidenceReference,
      actorUserId: userId,
    });
    return { success: true, data: result };
  }
}
