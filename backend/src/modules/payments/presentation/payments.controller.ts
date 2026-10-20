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
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { AuthCsrfGuard } from '../../auth/guards/auth-csrf.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Role } from '../../../enums/index.js';
import {
  CreatePaymentRequestUseCase,
  type CreatePaymentRequestInput,
} from '../application/create-payment-request.use-case.js';
import { VerifyReceiptUseCase } from '../application/verify-receipt.use-case.js';
import { RefundOrchestration } from '../application/refund-orchestration.js';
import { StaffBalanceUseCase } from '../application/staff-balance.use-case.js';
import { StaffAllocateUseCase } from '../application/staff-allocate.use-case.js';
import { StaffReconcileUseCase } from '../application/staff-reconcile.use-case.js';
import { PaymentAuditLogger } from '../infrastructure/payment-audit-logger.js';
import { PaymentOutcomeService } from '../application/payment-outcome.service.js';
import { GuestTokenGuard } from '../infrastructure/guest-token.guard.js';
import {
  CompleteManualRefundDto,
  CreatePaymentRequestDto,
  PaymentRequestResponseDto,
  PrepareManualRefundDto,
  RefundQuoteRequestDto,
  StaffAllocateDto,
  StaffBalanceDto,
} from './dto/payment-request.dto.js';
import type { StoredPaymentRequest } from '../ports/payment-store.js';

function presentRequest(
  request: StoredPaymentRequest,
): PaymentRequestResponseDto {
  return {
    id: request.id,
    paymentCode: request.paymentCode,
    purpose: request.purpose,
    amount: request.amount,
    currency: request.currency,
    method: request.method,
    providerOrderCode: request.providerOrderCode,
    checkoutUrl: request.checkoutUrl,
    vietQrPayload: request.vietQrPayload,
    status: request.status,
    expiresAt: request.expiresAt ? request.expiresAt.toISOString() : null,
    // reviewRequired/reviewReasonCode server-derived bổ sung ở slice
    // BE-PAY-06 (MIG-14) khi status/detail hợp nhất resolver.
    reviewRequired: false,
    reviewReasonCode: null,
  };
}

/**
 * BE-PAY-08/12/13/14 — Customer + staff payment routes.
 * - Customer routes: owner JWT + CSRF; authorize trước replay (MIG-12).
 * - Staff routes: STAFF/MANAGER qua RolesGuard trên staff path riêng.
 * - no-store cho mọi response tiền (MIG-17, không cache money facts).
 */
@Controller('api/payments')
@UseGuards(JwtAuthGuard, AuthCsrfGuard)
@ApiBearerAuth()
export class PaymentsController {
  constructor(
    private readonly createRequest: CreatePaymentRequestUseCase,
    private readonly receipts: VerifyReceiptUseCase,
    private readonly refunds: RefundOrchestration,
    private readonly outcomes: PaymentOutcomeService,
  ) {}

  @Post('requests')
  @ApiCreatedResponse({ type: PaymentRequestResponseDto })
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'E5: tạo yêu cầu thu 30%/100% hoặc số dư' })
  async create(
    @CurrentUser('userId') userId: string,
    @Body() input: CreatePaymentRequestDto,
  ) {
    const created = await this.createRequest.execute(
      { userId },
      input as CreatePaymentRequestInput,
    );
    return { success: true, data: presentRequest(created) };
  }

  @Get('requests/:id')
  @ApiOkResponse({ type: PaymentRequestResponseDto })
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'Chi tiết yêu cầu thu (poll metadata persisted)' })
  async requestById(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const request = await this.receipts.readRequest(id);
    if (!request)
      return { success: false, error: { code: 'PAYMENT_NOT_FOUND' } };
    // MIG-12: authorize owner trước khi trả resource (IDOR → 404).
    const owned = await this.outcomes.ownsBooking(request.referenceId, {
      userId,
    });
    if (!owned)
      return { success: false, error: { code: 'PAYMENT_NOT_FOUND' } };
    return { success: true, data: presentRequest(request) };
  }

  @Get('requests/:id/status')
  @ApiOkResponse()
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'E7: trạng thái thu chuẩn (read DB only)' })
  async requestStatus(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const status = await this.outcomes.statusForRequest(id, { userId });
    if (!status)
      return { success: false, error: { code: 'PAYMENT_NOT_FOUND' } };
    return { success: true, data: status };
  }

  @Get('requests')
  @ApiOkResponse()
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'E6: request mới nhất của booking (recovery)' })
  async latest(
    @CurrentUser('userId') userId: string,
    @Query('bookingId', ParseUUIDPipe) bookingId: string,
    @Query('purpose') purpose?: 'PREPAYMENT' | 'BALANCE',
  ) {
    const data = await this.outcomes.latestForBooking(
      bookingId,
      purpose,
      { userId },
    );
    return { success: true, data };
  }

  @Post('refunds/quote')
  @ApiCreatedResponse()
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'E8: báo giá hoàn theo money revision (MIG-19)' })
  async quote(
    @CurrentUser('userId') userId: string,
    @Body() input: RefundQuoteRequestDto,
  ) {
    const quote = await this.refunds.quoteForCancellation({
      bookingId: input.bookingId,
      cancellationRequestId: input.cancellationRequestId,
      actorUserId: userId,
    });
    return { success: true, data: quote };
  }
}

@Controller('api/staff/payments')
@UseGuards(JwtAuthGuard, AuthCsrfGuard, RolesGuard)
@Roles(Role.STAFF, Role.MANAGER, Role.ADMIN)
@ApiBearerAuth()
export class StaffPaymentsController {
  constructor(
    private readonly refunds: RefundOrchestration,
    private readonly balance: StaffBalanceUseCase,
    private readonly allocate: StaffAllocateUseCase,
    private readonly reconcile: StaffReconcileUseCase,
  ) {}

  @Post('refunds/prepare')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'E20-PREPARE: cố định intent hoàn thủ công (MIG-04)' })
  async prepare(
    @CurrentUser('userId') userId: string,
    @Body() input: PrepareManualRefundDto,
  ) {
    const result = await this.refunds.prepareManualRefund({
      refundRequestId: input.refundRequestId,
      amount: input.amount,
      sourceAccountKey: input.sourceAccountKey,
      destinationBankBin: input.destinationBankBin,
      destinationAccountLast4: input.destinationAccountLast4,
      destinationAccountName: input.destinationAccountName,
      idempotencyKey: input.idempotencyKey,
      actorUserId: userId,
    });
    return { success: true, data: result };
  }

  @Post('refunds/complete')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'E20-COMPLETE: finalize đúng attempt (MIG-04)' })
  async complete(
    @CurrentUser('userId') userId: string,
    @Body() input: CompleteManualRefundDto,
  ) {
    const result = await this.refunds.completeManualRefund({
      attemptId: input.attemptId,
      bankTransactionReference: input.bankTransactionReference,
      evidenceReference: input.evidenceReference,
      actorUserId: userId,
    });
    return { success: true, data: result };
  }

  @Post('balance')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'E14: staff thu số dư (RULE-BALANCE)' })
  async balanceDue(
    @CurrentUser('userId') userId: string,
    @Body() input: StaffBalanceDto,
  ) {
    const result = await this.balance.execute({
      bookingId: input.bookingId,
      method: input.method,
      amount: input.amount,
      transactionReference: input.transactionReference,
      idempotencyKey: input.idempotencyKey,
      staffUserId: userId,
    });
    return { success: true, data: result };
  }

  @Post('receipts/:receiptId/allocate')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'E16: staff allocate receipt (RULE-ALLOC)' })
  async allocateReceipt(
    @CurrentUser('userId') userId: string,
    @Param('receiptId', ParseUUIDPipe) receiptId: string,
    @Body() input: StaffAllocateDto,
  ) {
    const result = await this.allocate.execute({
      receiptId,
      paymentRequestId: input.paymentRequestId,
      idempotencyKey: input.idempotencyKey,
      note: input.note,
      staffUserId: userId,
    });
    return { success: true, data: result };
  }

  @Post('requests/:requestId/reconcile')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'E15: đối soát request với provider (timestamps only)' })
  async reconcileRequest(
    @CurrentUser('userId') userId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    const result = await this.reconcile.execute({
      requestId,
      actorUserId: userId,
    });
    return { success: true, data: result };
  }
}

/**
 * E1 — Payment quote read-only (BE-PAY-06): chỉ booking HOLDING.
 */
@Controller('api/bookings')
@UseGuards(JwtAuthGuard, AuthCsrfGuard)
@ApiBearerAuth()
export class BookingPaymentController {
  constructor(private readonly outcomes: PaymentOutcomeService) {}

  @Get(':id/payment-quote')
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'E1: báo giá thanh toán từ snapshot server' })
  async quote(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.outcomes.quoteForBooking(id, { userId });
    if (!data) return { success: false, error: { code: 'BOOKING_NOT_FOUND' } };
    if (data.error) return { success: false, error: data.error };
    return { success: true, data: data.quote };
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'E4: booking detail kèm payment' })
  async detail(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.outcomes.bookingDetail(id, { userId });
    if (!data) return { success: false, error: { code: 'BOOKING_NOT_FOUND' } };
    return { success: true, data };
  }
}

/**
 * E12 — Staff lookup booking theo code/phone (rate-limit riêng vì PII ở
 * throttler global; audit mọi access; chỉ trả phone last4).
 */
@Controller('api/staff/bookings')
@UseGuards(JwtAuthGuard, AuthCsrfGuard, RolesGuard)
@Roles(Role.STAFF, Role.MANAGER, Role.ADMIN)
@ApiBearerAuth()
export class StaffLookupController {
  constructor(
    private readonly outcomes: PaymentOutcomeService,
    private readonly audit: PaymentAuditLogger,
  ) {}

  @Get('lookup')
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'E12: staff lookup (masked + audit)' })
  async lookup(
    @CurrentUser('userId') userId: string,
    @Query('query') query?: string,
  ) {
    const data = await this.outcomes.staffLookup(
      typeof query === 'string' ? query : '',
    );
    if (data) {
      await this.audit.log({
        actorType: 'STAFF',
        actorUserId: userId,
        action: 'lookup',
        entityType: 'booking',
        entityId: data.bookingId,
        bookingId: data.bookingId,
        result: 'OK',
        detail: { queryKind: data.queryKind },
      });
    }
    if (!data) return { success: false, error: { code: 'BOOKING_NOT_FOUND' } };
    return { success: true, data: data.dto };
  }
}

/**
 * E11 — Refund tracker (MIG-16): owner JWT hoặc guest token đã bind.
 */
@Controller('api/refunds')
@UseGuards(JwtAuthGuard, AuthCsrfGuard)
@ApiBearerAuth()
export class RefundsController {
  constructor(private readonly outcomes: PaymentOutcomeService) {}

  @Get()
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'E11: tracker hoàn tiền (masked)' })
  async list(
    @CurrentUser('userId') userId: string,
    @Query('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    const data = await this.outcomes.refundsForBooking(bookingId, { userId });
    if (!data) return { success: false, error: { code: 'PAYMENT_NOT_FOUND' } };
    return { success: true, data };
  }
}

/**
 * Guest payment reads qua scoped token (MIG-11): E7-status, E6-latest, E11.
 * Không CSRF (stateless, không cookie); token qua header, không query.
 */
@Controller('api/guest/payments')
@UseGuards(GuestTokenGuard)
export class GuestPaymentsController {
  constructor(private readonly outcomes: PaymentOutcomeService) {}

  private subject(request: Request): {
    userId: string | null;
    guestBookingId?: string;
  } {
    return {
      userId: null,
      guestBookingId: (request as Request & { guestBookingId?: string })
        .guestBookingId,
    };
  }

  @Get('requests/:id/status')
  @Header('Cache-Control', 'no-store, private')
  async requestStatus(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const status = await this.outcomes.statusForRequest(id, this.subject(request));
    if (!status)
      return { success: false, error: { code: 'PAYMENT_NOT_FOUND' } };
    return { success: true, data: status };
  }

  @Get('requests')
  @Header('Cache-Control', 'no-store, private')
  async latest(
    @Req() request: Request,
    @Query('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    const data = await this.outcomes.latestForBooking(
      bookingId,
      undefined,
      this.subject(request),
    );
    return { success: true, data };
  }

  @Get('refunds')
  @Header('Cache-Control', 'no-store, private')
  async refunds(
    @Req() request: Request,
    @Query('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    const data = await this.outcomes.refundsForBooking(
      bookingId,
      this.subject(request),
    );
    if (!data) return { success: false, error: { code: 'PAYMENT_NOT_FOUND' } };
    return { success: true, data };
  }
}
