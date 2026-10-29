import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from '../auth/auth.module.js';
import { CourtsModule } from '../courts/courts.module.js';
import { CreatePaymentRequestUseCase } from './application/create-payment-request.use-case.js';
import { VerifyReceiptUseCase } from './application/verify-receipt.use-case.js';
import { RefundOrchestration } from './application/refund-orchestration.js';
import { BookingConfirmationCoordinator } from './application/booking-confirmation-coordinator.js';
import { GuestCreateHoldUseCase } from './application/guest-create-hold.use-case.js';
import { SendGuestOtpUseCase } from './application/send-guest-otp.use-case.js';
import { VerifyGuestOtpUseCase } from './application/verify-guest-otp.use-case.js';
import { ResumeGuestIntentUseCase } from './application/resume-guest-intent.use-case.js';
import { CancelGuestHoldUseCase } from './application/cancel-guest-hold.use-case.js';
import { GetGuestHoldRecoveryUseCase } from './application/get-guest-hold-recovery.use-case.js';
import { GuestCheckoutReconcileService } from './application/guest-checkout-reconcile.service.js';
import { PaymentOutcomeService } from './application/payment-outcome.service.js';
import { StaffBalanceUseCase } from './application/staff-balance.use-case.js';
import { StaffAllocateUseCase } from './application/staff-allocate.use-case.js';
import { StaffRefundsUseCase } from './application/staff-refunds.use-case.js';
import { StaffReconcileUseCase } from './application/staff-reconcile.use-case.js';
import {
  PAYMENTS_QUEUE,
  PaymentsJobScheduler,
  PaymentsWorker,
} from './application/payments-workers.js';
import { PayosSignatureService } from './infrastructure/payos-signature.service.js';
import { PayosGatewayAdapter } from './infrastructure/payos-gateway.adapter.js';
import { PayosWebhookInbox } from './infrastructure/payos-webhook-inbox.js';
import { GuestTokenService } from './infrastructure/guest-token.service.js';
import { GuestTokenGuard } from './infrastructure/guest-token.guard.js';
import { GuestCheckoutTokenGuard } from './infrastructure/guest-checkout-token.guard.js';
import { PrismaGuestCheckoutStore } from './infrastructure/prisma-guest-checkout-store.js';
import { AuthGuestOtpSender } from './infrastructure/auth-guest-otp-sender.js';
import { GuestCheckoutStore } from './ports/guest-checkout-store.js';
import { GuestOtpSender } from './ports/guest-otp-sender.js';
import { PaymentAuditLogger } from './infrastructure/payment-audit-logger.js';
import { RefundDestinationCrypto } from './infrastructure/refund-destination-crypto.js';
import { PrismaPaymentStore } from './infrastructure/prisma-payment-store.js';
import { PaymentStore } from './ports/payment-store.js';
import {
  BookingPaymentController,
  GuestPaymentsController,
  PaymentsController,
  RefundsController,
  StaffLookupController,
  StaffPaymentsController,
} from './presentation/payments.controller.js';
import { StaffRefundsController } from './presentation/staff-refunds.controller.js';
import { PayosWebhookController } from './presentation/payos-webhook.controller.js';
import {
  GuestBookingsController,
  StaffGuestTokenController,
} from './presentation/guest-bookings.controller.js';

/**
 * BE-PAY-01..18 — Payments module wiring (MIG-13).
 * Booking port giữ ownership một chiều: payments không import BookingsModule
 * để tránh Nest circular import; điều phối confirm qua receipt events ở
 * slice BE-PAY-11.
 */
@Module({
  imports: [
    ConfigModule,
    AuthModule,
    CourtsModule,
    BullModule.registerQueue({ name: PAYMENTS_QUEUE }),
  ],
  controllers: [
    PaymentsController,
    BookingPaymentController,
    RefundsController,
    GuestPaymentsController,
    StaffPaymentsController,
    StaffRefundsController,
    StaffLookupController,
    PayosWebhookController,
    GuestBookingsController,
    StaffGuestTokenController,
  ],
  providers: [
    CreatePaymentRequestUseCase,
    VerifyReceiptUseCase,
    RefundOrchestration,
    BookingConfirmationCoordinator,
    GuestCreateHoldUseCase,
    SendGuestOtpUseCase,
    VerifyGuestOtpUseCase,
    ResumeGuestIntentUseCase,
    CancelGuestHoldUseCase,
    GetGuestHoldRecoveryUseCase,
    GuestCheckoutReconcileService,
    PaymentOutcomeService,
    StaffBalanceUseCase,
    StaffAllocateUseCase,
    StaffRefundsUseCase,
    StaffReconcileUseCase,
    PayosSignatureService,
    PayosGatewayAdapter,
    PayosWebhookInbox,
    GuestTokenService,
    GuestTokenGuard,
    GuestCheckoutTokenGuard,
    PaymentAuditLogger,
    RefundDestinationCrypto,
    PaymentsJobScheduler,
    PaymentsWorker,
    { provide: PaymentStore, useClass: PrismaPaymentStore },
    { provide: GuestCheckoutStore, useClass: PrismaGuestCheckoutStore },
    { provide: GuestOtpSender, useClass: AuthGuestOtpSender },
  ],
  exports: [
    PaymentStore,
    VerifyReceiptUseCase,
    RefundOrchestration,
    BookingConfirmationCoordinator,
    PaymentOutcomeService,
    PaymentAuditLogger,
    GuestTokenService,
    GuestTokenGuard,
    GuestCheckoutTokenGuard,
  ],
})
export class PaymentsModule {}
