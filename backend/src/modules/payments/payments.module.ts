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
import { SimulateDemoPaymentUseCase } from './application/simulate-demo-payment.use-case.js';
import {
  PAYMENTS_QUEUE,
  PaymentsJobScheduler,
  PaymentsWorker,
} from './application/payments-workers.js';
import { PayosSignatureService } from './infrastructure/payos-signature.service.js';
import { PayosDemoSigner } from './infrastructure/payos-demo-signer.js';
import { PayosGatewayAdapter } from './infrastructure/payos-gateway.adapter.js';
import { PayosDemoGatewayAdapter } from './infrastructure/payos-demo-gateway.adapter.js';
import { PayosWebhookInbox } from './infrastructure/payos-webhook-inbox.js';
import { GuestTokenService } from './infrastructure/guest-token.service.js';
import { GuestTokenGuard } from './infrastructure/guest-token.guard.js';
import { GuestCheckoutTokenGuard } from './infrastructure/guest-checkout-token.guard.js';
import { PrismaGuestCheckoutStore } from './infrastructure/prisma-guest-checkout-store.js';
import { AuthGuestOtpSender } from './infrastructure/auth-guest-otp-sender.js';
import { GuestCheckoutStore } from './ports/guest-checkout-store.js';
import { GuestOtpSender } from './ports/guest-otp-sender.js';
import { GuestRecoveryOutboxCrypto } from './infrastructure/guest-recovery-outbox-crypto.js';
import { GuestRecoveryMailService } from './infrastructure/guest-recovery-mail.service.js';
import { BookingConfirmationMailService } from './infrastructure/booking-confirmation-mail.service.js';
import { BookingConfirmationMailWorker } from './application/booking-confirmation-mail.worker.js';
import { GuestRecoveryOutboxWriter } from './application/guest-recovery-outbox.writer.js';
import { GuestRecoveryMailWorker } from './application/guest-recovery-mail.worker.js';
import { RequestGuestRecoveryLinkUseCase } from './application/request-guest-recovery-link.use-case.js';
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
import { PayosSimulationController } from './presentation/payos-simulation.controller.js';
import { DemoPaymentAccessGuard } from './infrastructure/demo-payment-access.guard.js';
import {
  GuestDemoPaymentsController,
  MemberDemoPaymentsController,
} from './presentation/demo-payment.controller.js';
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
    PayosSimulationController,
    MemberDemoPaymentsController,
    GuestDemoPaymentsController,
    GuestBookingsController,
    StaffGuestTokenController,
  ],
  providers: [
    CreatePaymentRequestUseCase,
    SimulateDemoPaymentUseCase,
    DemoPaymentAccessGuard,
    VerifyReceiptUseCase,
    RefundOrchestration,
    BookingConfirmationCoordinator,
    GuestCreateHoldUseCase,
    SendGuestOtpUseCase,
    VerifyGuestOtpUseCase,
    ResumeGuestIntentUseCase,
    CancelGuestHoldUseCase,
    GetGuestHoldRecoveryUseCase,
    RequestGuestRecoveryLinkUseCase,
    GuestRecoveryOutboxWriter,
    GuestRecoveryMailWorker,
    GuestCheckoutReconcileService,
    PaymentOutcomeService,
    StaffBalanceUseCase,
    StaffAllocateUseCase,
    StaffRefundsUseCase,
    StaffReconcileUseCase,
    PayosSignatureService,
    PayosDemoSigner,
    PayosGatewayAdapter,
    PayosDemoGatewayAdapter,
    PayosWebhookInbox,
    GuestTokenService,
    GuestTokenGuard,
    GuestCheckoutTokenGuard,
    RefundDestinationCrypto,
    GuestRecoveryOutboxCrypto,
    GuestRecoveryMailService,
    BookingConfirmationMailService,
    BookingConfirmationMailWorker,
    PaymentAuditLogger,
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
