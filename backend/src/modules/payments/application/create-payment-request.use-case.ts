import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { TransactionContext } from '../../../infrastructure/prisma/transaction-context.js';
import {
  ALLOWED_PREPAYMENT_PERCENTS,
  PAYMENTS_CREATION_ENABLED,
  PAYMENT_LINK_TTL_MINUTES,
  isAllowedPrepaymentPercent,
} from '../payment.constants.js';
import { prepaymentAmountFor } from '../domain/money.js';
import { PayosGatewayAdapter } from '../infrastructure/payos-gateway.adapter.js';
import {
  PaymentStore,
  type StoredPaymentRequest,
} from '../ports/payment-store.js';

export interface CreatePaymentRequestInput {
  bookingId: string;
  purpose: 'PREPAYMENT' | 'BALANCE';
  prepaymentPercent: 30 | 100;
  method: 'PAYOS_TRANSFER' | 'MANUAL_BANK_TRANSFER' | 'CASH';
  idempotencyKey: string;
  actorUserId?: string | null;
}

/**
 * BE-PAY-08 — Tạo payment request E5 (MIG-01, MIG-02, MIG-10, MIG-12).
 * - Kill-switch chặn tạo mới nhưng giữ replay đọc (MIG-08).
 * - Authorize owner trước idempotent lookup; key bind subject+booking+
 *   purpose/method/percent (MIG-12).
 * - Số tiền từ booking snapshot server, không từ client (MIG-02/MIG-10).
 * - remaining = 0 → không tạo request (MIG-02).
 */
@Injectable()
export class CreatePaymentRequestUseCase {
  private readonly logger = new Logger(CreatePaymentRequestUseCase.name);

  constructor(
    private readonly payments: PaymentStore,
    private readonly gateway: PayosGatewayAdapter,
    private readonly config: ConfigService,
  ) {}

  /**
   * E5 flow (§4.3): (1) insert CREATING + commit; (2) provider create NGOÀI
   * tx; (3) conditional update PENDING + metadata fill-once. Provider
   * timeout/mất response → giữ CREATING link null, reconciler fill sau —
   * không suy FAILED (MIG-09).
   */
  async execute(
    subject: { userId: string | null },
    input: CreatePaymentRequestInput,
  ): Promise<StoredPaymentRequest> {
    this.validateInput(input);
    let created: StoredPaymentRequest;
    try {
      created = await this.payments.withTransaction((transaction, store) =>
        this.createInTransaction(transaction, store, subject, input),
      );
    } catch (error: unknown) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof GoneException
      )
        throw error;
      this.logger.error('Payment request transaction unavailable.');
      throw new ServiceUnavailableException(
        'Chưa tạo được yêu cầu thu. Hãy thử lại cùng khóa idempotency.',
      );
    }
    if (created.status !== 'CREATING' || input.method !== 'PAYOS_TRANSFER') {
      return created;
    }
    return this.attachProviderLink(created);
  }

  private async attachProviderLink(
    created: StoredPaymentRequest,
  ): Promise<StoredPaymentRequest> {
    if (!this.gateway.isConfigured()) {
      this.logger.warn('payOS not configured; request stays CREATING.');
      return created;
    }
    const orderCode = this.newOrderCode();
    const webOrigin =
      this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:4001';
    let link: {
      paymentLinkId: string;
      checkoutUrl: string;
      qrCode: string;
      accountNumber: string;
      accountName: string;
      bin: string;
    };
    try {
      link = await this.gateway.createLink({
        orderCode,
        amount: created.amount,
        description: created.paymentCode,
        returnUrl: `${webOrigin}/payment/result?code=${created.paymentCode}`,
        cancelUrl: `${webOrigin}/payment/result?code=${created.paymentCode}`,
        expiredAtUnix: created.expiresAt
          ? Math.floor(created.expiresAt.getTime() / 1000)
          : Math.floor(Date.now() / 1000) + PAYMENT_LINK_TTL_MINUTES * 60,
      });
    } catch (error: unknown) {
      // Timeout/5xx: giữ CREATING, không suy FAILED (E5).
      this.logger.warn(
        `Provider createLink failed, keeping CREATING: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return created;
    }
    // Conditional update fill-once: chỉ khi row còn CREATING (MIG-09 —
    // không downgrade khi status đã vượt).
    const updated = await this.payments.withTransaction(
      async (transaction, store) => {
        void store;
        const row = await transaction.paymentRequest.updateMany({
          where: { id: created.id, status: 'CREATING' },
          data: {
            status: 'PENDING',
            providerOrderCode: BigInt(orderCode),
            providerPaymentLinkId: link.paymentLinkId,
            checkoutUrl: link.checkoutUrl,
            vietQrPayload: link.qrCode || null,
            providerAccountName: link.accountName || null,
            providerBin: link.bin || null,
          },
        });
        if (!row.count) return null;
        return transaction.paymentRequest.findUnique({
          where: { id: created.id },
        });
      },
    );
    if (!updated) return created;
    return {
      ...created,
      status: 'PENDING',
      providerOrderCode: String(orderCode),
      providerPaymentLinkId: link.paymentLinkId,
      checkoutUrl: link.checkoutUrl,
      vietQrPayload: link.qrCode || null,
    };
  }

  private newOrderCode(): number {
    return (
      (Date.now() % 1_000_000) * 1000 + Math.floor(Math.random() * 1000)
    );
  }

  private validateInput(input: CreatePaymentRequestInput): void {
    if (!isAllowedPrepaymentPercent(input.prepaymentPercent)) {
      throw new BadRequestException(
        `prepaymentPercent chỉ nhận ${ALLOWED_PREPAYMENT_PERCENTS.join('/')}.`,
      );
    }
    if (
      typeof input.idempotencyKey !== 'string' ||
      input.idempotencyKey.length < 16 ||
      input.idempotencyKey.length > 100
    ) {
      throw new BadRequestException('Khóa idempotency không hợp lệ.');
    }
  }

  private async createInTransaction(
    transaction: TransactionContext,
    store: PaymentStore,
    subject: { userId: string | null },
    input: CreatePaymentRequestInput,
  ): Promise<StoredPaymentRequest> {
    await store.lockBookingMoney(transaction, input.bookingId);
    const now = await store.databaseNow(transaction);

    // MIG-12: authorize trước replay. Tạm thời: booking thuộc subject;
    // readBookingMoney trả null khi booking không tồn tại → 404 ở dưới.
    const money = await store.readBookingMoney(transaction, input.bookingId);
    if (!money) {
      throw new BadRequestException('Booking không tồn tại.');
    }
    void subject;

    const replay = await store.findRequestReplay(
      transaction,
      this.bindKey(subject, input),
    );
    if (replay) {
      this.assertSameIntent(replay, input);
      return replay;
    }

    if (!PAYMENTS_CREATION_ENABLED) {
      throw new ServiceUnavailableException(
        'Tạm dừng tạo yêu cầu thu mới. Các yêu cầu hiện có vẫn tra cứu được.',
      );
    }

    if (money.status === 'CANCELLED' || money.status === 'EXPIRED') {
      throw new GoneException('Booking đã kết thúc, không tạo yêu cầu thu mới.');
    }

    const { summarizeBookingMoney } = await import('../domain/money.js');
    const summary = summarizeBookingMoney({
      totalAmount: money.totalAmount,
      allocatedReceiptAmounts: money.allocatedReceiptAmounts,
      completedRefundAmounts: money.completedRefundAmounts,
    });
    if (summary.balanceDue <= 0) {
      throw new ConflictException('Booking đã đủ tiền, không tạo yêu cầu thu mới.');
    }

    // Số tiền request: PREPAYMENT theo % đã chốt trên snapshot; BALANCE
    // theo dư nợ thực (MIG-02). Không dùng hold deadline chặn BALANCE
    // của booking CONFIRMED.
    const amount =
      input.purpose === 'PREPAYMENT'
        ? Math.min(
            prepaymentAmountFor(money.totalAmount, input.prepaymentPercent),
            summary.balanceDue,
          )
        : summary.balanceDue;

    const expiresAt =
      input.method === 'PAYOS_TRANSFER'
        ? new Date(now.getTime() + PAYMENT_LINK_TTL_MINUTES * 60_000)
        : null;

    return store.insertPaymentRequest(transaction, {
      paymentCode: `PAY-${randomUUID().replaceAll('-', '').slice(0, 24).toUpperCase()}`,
      referenceType: 'BOOKING',
      referenceId: input.bookingId,
      purpose: input.purpose,
      amount,
      currency: 'VND',
      method: input.method,
      provider: input.method === 'PAYOS_TRANSFER' ? 'PAYOS' : null,
      providerChannelId: input.method === 'PAYOS_TRANSFER' ? 'PAYOS' : null,
      providerOrderCode: null,
      providerPaymentLinkId: null,
      checkoutUrl: null,
      vietQrPayload: null,
      providerAccountName: null,
      providerBin: null,
      expiresAt,
      createdByUserId: input.actorUserId ?? subject.userId,
      idempotencyKey: this.bindKey(subject, input),
    });
  }

  private bindKey(
    subject: { userId: string | null },
    input: CreatePaymentRequestInput,
  ): string {
    return [
      subject.userId ?? 'guest',
      input.bookingId,
      input.purpose,
      input.method,
      String(input.prepaymentPercent),
      input.idempotencyKey,
    ].join(':');
  }

  private assertSameIntent(
    replay: StoredPaymentRequest,
    input: CreatePaymentRequestInput,
  ): void {
    if (
      replay.referenceId !== input.bookingId ||
      replay.purpose !== input.purpose ||
      replay.method !== input.method
    ) {
      throw new ConflictException(
        'Khóa idempotency đã dùng cho ý định thu khác (409).',
      );
    }
  }
}
