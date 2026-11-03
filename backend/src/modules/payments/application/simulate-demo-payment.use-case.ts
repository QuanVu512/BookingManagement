import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  PayosDemoSigner,
  isDemoLinkId,
} from '../infrastructure/payos-demo-signer.js';
import { PayosSignatureService } from '../infrastructure/payos-signature.service.js';
import { PayosWebhookInbox } from '../infrastructure/payos-webhook-inbox.js';
import { PaymentStore } from '../ports/payment-store.js';
import { PaymentAuditLogger } from '../infrastructure/payment-audit-logger.js';
import { PaymentOutcomeService } from './payment-outcome.service.js';
import { VerifyReceiptUseCase } from './verify-receipt.use-case.js';

export interface SimulateDemoPaymentSubject {
  userId: string | null;
  guestBookingId?: string;
  actorUserId?: string | null;
}

/**
 * BE-PAY-DEMO — Mô phỏng thanh toán thành công cho showcase (F01–F06 review).
 * - Cờ server `ENABLE_PAYMENT_SIMULATION === 'true'` mới mở; ngược lại 404.
 * - Authorize owner (member JWT/CSRF ở controller, guest token bind booking)
 *   TRƯỚC khi ký; mọi số liệu lấy từ DB, không từ client.
 * - Identity bền vững theo payment request (reference = paymentCode, F05);
 *   ingest qua inbox thật nên dedup/canonical giữ nguyên 100%.
 * - ingest chỉ nghĩa là đã nhận event (F04): use case claim + xử lý ngay qua
 *   canonical receipt path, finalize cùng worker; claim trượt thì trả accepted
 *   và scanner phục hồi, UI poll outcome cho tới server-confirmed.
 * - Cọc 30% chỉ xác nhận cọc/CONFIRMED (F07); đủ/không đủ điều kiện check-in
 *   do eligibility hiện hành quyết định, không nới ở đây.
 */
@Injectable()
export class SimulateDemoPaymentUseCase {
  constructor(
    private readonly payments: PaymentStore,
    private readonly signer: PayosDemoSigner,
    private readonly signatures: PayosSignatureService,
    private readonly inbox: PayosWebhookInbox,
    private readonly receipts: VerifyReceiptUseCase,
    private readonly outcomes: PaymentOutcomeService,
    private readonly audit: PaymentAuditLogger,
  ) {}

  async executeForOrderCode(
    orderCode: number,
    subject: SimulateDemoPaymentSubject,
  ) {
    if (!this.signer.isSimulationEnabled()) {
      throw new NotFoundException('Không khả dụng.');
    }
    const requests = await this.payments.findRequestsByOrderCode(orderCode);
    // orderCode demo dùng hash; trường hợp trùng không được chọn nhầm đơn.
    if (requests.length !== 1) {
      throw new NotFoundException(
        'Yêu cầu thu không tồn tại hoặc không duy nhất.',
      );
    }
    return this.execute(requests[0].id, subject);
  }

  async execute(
    requestId: string,
    subject: SimulateDemoPaymentSubject,
  ): Promise<{
    eventId: string;
    status: 'processed' | 'accepted';
    outcome: unknown;
  }> {
    if (!this.signer.isSimulationEnabled()) {
      throw new NotFoundException('Không khả dụng.');
    }
    if (!this.signatures.isConfigured()) {
      throw new ServiceUnavailableException(
        'Máy chủ chưa sẵn sàng xác minh chữ ký demo.',
      );
    }
    const request = await this.payments.withTransaction((transaction, store) =>
      store.readPaymentRequest(transaction, requestId),
    );
    if (!request) {
      throw new NotFoundException('Yêu cầu thu không tồn tại.');
    }
    const owned = await this.outcomes.ownsBooking(request.referenceId, {
      userId: subject.userId,
      guestBookingId: subject.guestBookingId,
    });
    if (!owned) {
      throw new NotFoundException('Yêu cầu thu không tồn tại.');
    }
    if (request.method !== 'PAYOS_TRANSFER') {
      throw new ConflictException('Chế độ demo chỉ mô phỏng kênh payOS.');
    }
    if (!isDemoLinkId(request.providerPaymentLinkId)) {
      throw new ConflictException('Chỉ mô phỏng yêu cầu thanh toán demo.');
    }
    if (request.expiresAt && request.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException('Yêu cầu thanh toán đã hết hạn.');
    }
    if (!['CREATING', 'PENDING', 'PARTIALLY_PAID'].includes(request.status)) {
      throw new ConflictException(
        'Yêu cầu thu đã ở trạng thái cuối, không mô phỏng thêm.',
      );
    }

    const occurredAt = new Date();
    const data = this.signer.buildDemoData({
      paymentCode: request.paymentCode,
      amount: request.amount,
      paymentLinkId: request.providerPaymentLinkId,
      occurredAt,
    });
    const signature = this.signer.signWebhookData(data);
    const ingested = await this.inbox.ingest({
      code: '00',
      desc: 'success',
      success: true,
      data,
      signature,
    });

    const actorType = subject.userId ? 'CUSTOMER' : 'GUEST';
    const claim = await this.inbox.claim(ingested.eventId);
    if (!claim) {
      const outcome = await this.outcomes.statusForRequest(requestId, {
        userId: subject.userId,
        guestBookingId: subject.guestBookingId,
      });
      await this.audit.log({
        actorType,
        actorUserId: subject.actorUserId ?? subject.userId,
        action: 'demo_simulate',
        entityType: 'payment_request',
        entityId: request.id,
        bookingId: request.referenceId,
        result: 'OK',
        detail: { eventId: ingested.eventId, mode: 'accepted' },
      });
      return { eventId: ingested.eventId, status: 'accepted', outcome };
    }
    try {
      await this.processClaimedEvent(request.referenceId, request.id, data);
      await this.inbox.finalize(
        ingested.eventId,
        claim.generation,
        'PROCESSED',
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown';
      await this.inbox.finalize(
        ingested.eventId,
        claim.generation,
        /conflict|not found|terminal/i.test(message) ? 'IGNORED' : 'FAILED',
        message,
      );
      await this.audit.log({
        actorType,
        actorUserId: subject.actorUserId ?? subject.userId,
        action: 'demo_simulate',
        entityType: 'payment_request',
        entityId: request.id,
        bookingId: request.referenceId,
        result: 'FAILED',
        detail: { eventId: ingested.eventId },
      });
      throw error;
    }

    await this.audit.log({
      actorType,
      actorUserId: subject.actorUserId ?? subject.userId,
      action: 'demo_simulate',
      entityType: 'payment_request',
      entityId: request.id,
      bookingId: request.referenceId,
      result: 'OK',
      detail: { eventId: ingested.eventId, mode: 'processed' },
    });
    const outcome = await this.outcomes.statusForRequest(requestId, {
      userId: subject.userId,
      guestBookingId: subject.guestBookingId,
    });
    return { eventId: ingested.eventId, status: 'processed', outcome };
  }

  /**
   * Xử lý event demo qua canonical receipt path, cùng invariant với worker
   * (signed success + khớp paymentCode + khớp amount DB).
   */
  private async processClaimedEvent(
    bookingId: string,
    requestId: string,
    data: {
      code?: string;
      amount?: number;
      description?: string;
      reference?: string;
      accountNumber?: string;
      transactionDateTime?: string;
    },
  ): Promise<void> {
    if (data.code !== '00' || typeof data.amount !== 'number') {
      throw new Error('Event thiếu signed success/amount — chuyển đối soát.');
    }
    const paymentCode = this.paymentCodeOf(data.description, data.reference);
    if (!paymentCode) {
      throw new Error('Không khớp paymentCode — chuyển đối soát.');
    }
    const request = await this.payments.withTransaction((transaction, store) =>
      store.readPaymentRequest(transaction, requestId),
    );
    if (!request || request.paymentCode !== paymentCode) {
      throw new Error('Payment request not found.');
    }
    if (request.amount !== data.amount) {
      throw new Error(
        'Khoản tiền trùng reference nhưng lệch số tiền — chuyển đối soát.',
      );
    }
    await this.receipts.execute(
      bookingId,
      {
        receivingAccountKey: `PAYOS:${data.accountNumber ?? 'unknown'}`,
        transactionReference: data.reference ?? null,
        amount: data.amount,
        currency: 'VND',
        fundsReceivedAt: data.transactionDateTime
          ? new Date(data.transactionDateTime)
          : new Date(),
        paymentRequestId: request.id,
        confirmationSource: 'WEBHOOK',
        recordedByUserId: null,
      },
      `demo:${request.id}`,
    );
  }

  private paymentCodeOf(
    description: string | undefined,
    reference: string | undefined,
  ): string | null {
    for (const text of [description, reference]) {
      if (!text) continue;
      const match = /PAY-([A-Z0-9]{8,32})/i.exec(text);
      if (match) return match[0].toUpperCase();
    }
    return null;
  }
}
