import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { TransactionContext } from '../../../infrastructure/prisma/transaction-context.js';
import {
  ALLOWED_PREPAYMENT_PERCENTS,
  PAYMENTS_CREATION_ENABLED,
  PAYMENT_LINK_TTL_MINUTES,
  guestPaymentIdempotencyKey,
  isAllowedPrepaymentPercent,
} from '../payment.constants.js';
import { prepaymentAmountFor } from '../domain/money.js';
import { PayosGatewayAdapter } from '../infrastructure/payos-gateway.adapter.js';
import { PayosDemoGatewayAdapter } from '../infrastructure/payos-demo-gateway.adapter.js';
import {
  PaymentStore,
  type StoredPaymentRequest,
} from '../ports/payment-store.js';

export interface CreatePaymentRequestInput {
  bookingId: string;
  purpose: 'PREPAYMENT' | 'BALANCE';
  prepaymentPercent?: 30 | 100;
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
    private readonly demoGateway: PayosDemoGatewayAdapter,
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

  /**
   * C07 — Phục hồi intent CREATING mồ côi (reconciler/worker gọi).
   * Đọc lại row; chỉ fill link khi row VẪN CREATING + PAYOS + chưa có link
   * VÀ cửa sổ hold còn mở (F2 — kể cả intent legacy key cũ, RR-P1-1).
   * Mọi nhánh còn lại trả nguyên trạng — không bao giờ suy FAILED ở đây.
   */
  async recoverOrphanedIntent(
    requestId: string,
  ): Promise<StoredPaymentRequest | null> {
    const current = await this.payments.withTransaction((transaction, store) =>
      store.readPaymentRequest(transaction, requestId),
    );
    if (
      !current ||
      current.status !== 'CREATING' ||
      current.method !== 'PAYOS_TRANSFER' ||
      current.providerPaymentLinkId != null
    ) {
      return current;
    }
    if (await this.isIntentWindowClosed(current)) {
      this.logger.warn(
        'Intent window closed; reconciler keeps CREATING without provider call.',
      );
      return current;
    }
    return this.attachProviderLink(current);
  }

  private async attachProviderLink(
    created: StoredPaymentRequest,
  ): Promise<StoredPaymentRequest> {
    if (
      created.method === 'PAYOS_TRANSFER' &&
      this.demoGateway.isDemoAvailable()
    ) {
      return this.attachDemoLink(created);
    }
    if (!this.gateway.isConfigured()) {
      this.logger.warn('payOS not configured; request stays CREATING.');
      return created;
    }
    // Không gọi provider khi chính request đã quá hạn (replay dữ liệu cũ):
    // tránh mời khách thanh toán cho cửa sổ đã đóng.
    if (await this.isIntentWindowClosed(created)) {
      this.logger.warn('Intent window closed; provider not called.');
      return created;
    }
    const orderCode = this.orderCodeForIntent(created);
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
    return this.fillIntentWithLink(created, {
      providerOrderCode: BigInt(orderCode),
      providerPaymentLinkId: link.paymentLinkId,
      checkoutUrl: link.checkoutUrl,
      vietQrPayload: link.qrCode || null,
      providerAccountName: link.accountName || null,
      providerBin: link.bin || null,
    });
  }

  /**
   * Phase 3 — chỉ fill-once khi row còn CREATING **và** cửa sổ hold còn mở
   * (guest PREPAYMENT). Luôn trả row đọc lại trong cùng transaction nên thua
   * race (cancel/sweep) sẽ trả trạng thái hiện hành, không phải snapshot cũ.
   */
  private async fillIntentWithLink(
    created: StoredPaymentRequest,
    data: {
      providerOrderCode: bigint;
      providerPaymentLinkId: string;
      checkoutUrl: string;
      vietQrPayload: string | null;
      providerAccountName: string | null;
      providerBin: string | null;
    },
  ): Promise<StoredPaymentRequest> {
    return this.payments.withTransaction(async (transaction, store) => {
      if (await this.isIntentWindowClosed(created, transaction, store)) {
        this.logger.warn(
          'Hold closed after provider I/O; link not persisted for CREATING intent.',
        );
        return (
          (await store.readPaymentRequest(transaction, created.id)) ?? created
        );
      }
      const updated = await transaction.paymentRequest.updateMany({
        where: { id: created.id, status: 'CREATING' },
        data: { status: 'PENDING', ...data },
      });
      // Thua race (cancel/sweep/worker): trả trạng thái hiện hành, không trả
      // snapshot CREATING cũ (F5).
      if (!updated.count) {
        return (
          (await store.readPaymentRequest(transaction, created.id)) ?? created
        );
      }
      return {
        ...created,
        status: 'PENDING',
        providerOrderCode: data.providerOrderCode.toString(),
        providerPaymentLinkId: data.providerPaymentLinkId,
        checkoutUrl: data.checkoutUrl,
        vietQrPayload: data.vietQrPayload,
      };
    });
  }

  /**
   * Cửa sổ thu đã đóng? Chỉ áp cho guest PREPAYMENT — nhận diện bằng booking
   * owner facts (userId null) + purpose, KHÔNG bằng format key, để intent
   * legacy dùng key cũ (AC3.1-5) tuân cùng F2 với canonical. Đơn thành
   * viên/BALANCE không có hold nên không guard. Dùng DB clock.
   */
  private async isIntentWindowClosed(
    request: StoredPaymentRequest,
    existingTransaction?: TransactionContext,
    existingStore?: PaymentStore,
  ): Promise<boolean> {
    if (request.purpose !== 'PREPAYMENT') return false;
    const peek = async (
      transaction: TransactionContext,
      store: PaymentStore,
    ): Promise<boolean> => {
      const money = await store.readBookingMoney(
        transaction,
        request.referenceId,
      );
      if (!money) return true;
      if ((money.userId ?? null) !== null) return false;
      const now = await store.databaseNow(transaction);
      if (
        request.expiresAt !== null &&
        now.getTime() >= request.expiresAt.getTime()
      )
        return true;
      if (money.status === 'CANCELLED' || money.status === 'EXPIRED')
        return true;
      return Boolean(
        money.holdExpiresAt && now.getTime() >= money.holdExpiresAt.getTime(),
      );
    };
    if (existingTransaction && existingStore) {
      return peek(existingTransaction, existingStore);
    }
    return this.payments.withTransaction(peek);
  }

  /**
   * Link demo cục bộ được ưu tiên khi cờ showcase bật, kể cả có credential.
   * Không gọi mạng payOS, không QR ngân hàng thật; conditional update
   * fill-once như nhánh provider để giữ invariant CREATING→PENDING.
   */
  private async attachDemoLink(
    created: StoredPaymentRequest,
  ): Promise<StoredPaymentRequest> {
    if (await this.isIntentWindowClosed(created)) {
      this.logger.warn('Intent window closed; demo link not created.');
      return created;
    }
    const link = await this.demoGateway.createDemoLink({
      paymentCode: created.paymentCode,
      amount: created.amount,
    });
    return this.fillIntentWithLink(created, {
      providerOrderCode: BigInt(link.orderCode),
      providerPaymentLinkId: link.paymentLinkId,
      checkoutUrl: link.checkoutUrl,
      vietQrPayload: link.qrCode || null,
      providerAccountName: link.accountName || null,
      providerBin: link.bin || null,
    });
  }

  /**
   * Order code ổn định theo ý định thu (booking + purpose). Retry/reconcile
   * dùng lại đúng code để provider không nhận hai lệnh cho cùng intent.
   * Không tuyên bố provider dedup (OPEN-1 vẫn mở).
   */
  private orderCodeForIntent(request: StoredPaymentRequest): number {
    if (request.providerOrderCode) {
      const existing = Number(request.providerOrderCode);
      if (Number.isSafeInteger(existing)) return existing;
    }
    const digest = createHash('sha256')
      .update(`payos-order:${request.referenceId}:${request.purpose}`)
      .digest();
    return Number(digest.readBigUInt64BE(0) % 9_000_000_000_000_000n);
  }

  private validateInput(input: CreatePaymentRequestInput): void {
    const percent = input.prepaymentPercent ?? 30;
    if (!isAllowedPrepaymentPercent(percent)) {
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

    // MIG-12: authorize trước replay. Booking thuộc subject mới được tạo request.
    const money = await store.readBookingMoney(transaction, input.bookingId);
    if (!money) {
      throw new BadRequestException('Booking không tồn tại.');
    }
    const ownerUserId = (money as { userId?: string | null }).userId ?? null;
    if (subject.userId !== null) {
      if (ownerUserId === null || ownerUserId !== subject.userId) {
        throw new BadRequestException('Booking không tồn tại.');
      }
    } else if (ownerUserId !== null) {
      throw new BadRequestException('Booking không tồn tại.');
    }

    const percent = input.prepaymentPercent ?? 30;
    if (
      money.requiredPrepaymentAmount > 0 &&
      money.requiredPrepaymentAmount !==
        Math.min(
          (await import('../domain/money.js')).prepaymentAmountFor(
            money.totalAmount,
            percent,
          ),
          money.totalAmount,
        ) &&
      input.purpose === 'PREPAYMENT'
    ) {
      throw new ConflictException(
        'Phần trăm trả trước không khớp snapshot booking (409).',
      );
    }

    const replay = await store.findRequestReplay(
      transaction,
      this.bindKey(subject, input),
    );

    // F2 — mutation cửa sổ hold do server quyết định: hết hạn/terminal thì
    // không replay thành công, không gọi provider, kể cả khi sweep chưa chạy.
    const guestPrepayment =
      subject.userId === null && input.purpose === 'PREPAYMENT';
    if (guestPrepayment) {
      if (money.status === 'CANCELLED' || money.status === 'EXPIRED') {
        throw new GoneException({
          code: 'BOOKING_TERMINAL',
          message: 'Booking đã kết thúc, không tạo yêu cầu thu mới.',
        });
      }
      if (
        money.holdExpiresAt !== null &&
        now.getTime() >= money.holdExpiresAt.getTime()
      ) {
        throw new ConflictException({
          code: 'CHECKOUT_READ_ONLY',
          message:
            'Đã hết thời gian giữ chỗ; đơn chỉ còn tra cứu, không thể tạo thanh toán.',
        });
      }
    }

    const { summarizeBookingMoney } = await import('../domain/money.js');
    const summary = summarizeBookingMoney({
      totalAmount: money.totalAmount,
      allocatedReceiptAmounts: money.allocatedReceiptAmounts,
      completedRefundAmounts: money.completedRefundAmounts,
    });
    const amount =
      input.purpose === 'PREPAYMENT'
        ? Math.min(
            prepaymentAmountFor(money.totalAmount, percent),
            summary.balanceDue,
          )
        : summary.balanceDue;
    if (replay) {
      this.assertSameIntent(replay, input, amount);
      // P2-1: FAILED chưa từng có link provider là retry an toàn trên cùng
      // intent (deadline/tiền đã kiểm). FAILED đã có link ⇒ không retry mù vì
      // trạng thái phía provider chưa chắc chắn; trả nguyên row cho reconcile.
      if (
        replay.status === 'FAILED' &&
        replay.providerPaymentLinkId === null &&
        replay.method === 'PAYOS_TRANSFER'
      ) {
        return (
          (await store.retryFailedRequest(transaction, replay.id)) ?? replay
        );
      }
      return replay;
    }

    // Dữ liệu trước Bước 3 có thể đã tạo request cho booking này bằng khóa
    // khác. Tái sử dụng request còn sống thay vì sinh lệnh thứ hai.
    if (subject.userId === null && input.purpose === 'PREPAYMENT') {
      const open = await store.findOpenRequestForBooking(
        transaction,
        input.bookingId,
        input.purpose,
      );
      if (open) {
        this.assertSameIntent(open, input, amount);
        return open;
      }
    }

    if (!PAYMENTS_CREATION_ENABLED) {
      throw new ServiceUnavailableException(
        'Tạm dừng tạo yêu cầu thu mới. Các yêu cầu hiện có vẫn tra cứu được.',
      );
    }

    if (money.status === 'CANCELLED' || money.status === 'EXPIRED') {
      throw new GoneException(
        'Booking đã kết thúc, không tạo yêu cầu thu mới.',
      );
    }

    if (summary.balanceDue <= 0) {
      throw new ConflictException(
        'Booking đã đủ tiền, không tạo yêu cầu thu mới.',
      );
    }

    // Số tiền request: PREPAYMENT theo % đã chốt trên snapshot; BALANCE
    // theo dư nợ thực (MIG-02). Không dùng hold deadline chặn BALANCE
    // của booking CONFIRMED.

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
    // Contract F5: guest PREPAYMENT dùng đúng một khóa canonical để hold và
    // lần gọi create sau đó replay cùng một PaymentRequest.
    if (subject.userId === null && input.purpose === 'PREPAYMENT') {
      return guestPaymentIdempotencyKey(input.bookingId);
    }
    // BLK-02: VARCHAR(100) — hash SHA-256 cố định 64 ký tự thay nối chuỗi dài.
    const raw = [
      subject.userId ?? 'guest',
      input.bookingId,
      input.purpose,
      input.method,
      String(input.prepaymentPercent ?? 30),
      input.idempotencyKey,
    ].join(':');
    return createHash('sha256').update(raw).digest('hex');
  }

  private assertSameIntent(
    replay: StoredPaymentRequest,
    input: CreatePaymentRequestInput,
    expectedAmount?: number,
  ): void {
    const percent = input.prepaymentPercent ?? 30;
    if (
      replay.referenceId !== input.bookingId ||
      replay.purpose !== input.purpose ||
      replay.method !== input.method ||
      Number(
        (replay as { prepaymentPercent?: unknown }).prepaymentPercent ??
          percent,
      ) !== percent ||
      (expectedAmount !== undefined && replay.amount !== expectedAmount)
    ) {
      throw new ConflictException(
        'Khóa idempotency đã dùng cho ý định thu khác (409).',
      );
    }
  }
}
