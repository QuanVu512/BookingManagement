import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { BookingConfirmationCoordinator } from './booking-confirmation-coordinator.js';
import { CreatePaymentRequestUseCase } from './create-payment-request.use-case.js';
import { VerifyReceiptUseCase } from './verify-receipt.use-case.js';
import { GuestCheckoutReconcileService } from './guest-checkout-reconcile.service.js';
import { PayosWebhookInbox } from '../infrastructure/payos-webhook-inbox.js';
import { PayosGatewayAdapter } from '../infrastructure/payos-gateway.adapter.js';

export const PAYMENTS_QUEUE = 'payments';

const MAX_OUTBOX_ATTEMPTS = 25;

/**
 * BE-PAY-16 — Background workers (MIG-07, MIG-08).
 * - Mọi job idempotent: conditional update + canonical dedup + generation
 *   fencing; chạy lại/concurrent an toàn.
 * - PostgreSQL là source of truth; Redis/BullMQ chỉ là trigger lịch.
 * - UNKNOWN payment/refund không bao giờ retry mù (MIG-04): webhook-retry
 *   chỉ xử lý event đã verify signed success; terminal-watch không suy success.
 * - Outbox: publish sau business commit; chỉ mark published sau ACK của sink;
 *   chưa có sink thật → bounded attempts rồi quarantine cho ops (không mất).
 */
@Injectable()
export class PaymentsJobScheduler implements OnModuleInit {
  constructor(@InjectQueue(PAYMENTS_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    // BullMQ v6: lịch lặp qua Job Scheduler (upsert idempotent).
    const schedules: { id: string; every: number }[] = [
      { id: 'expiry-sweep', every: 60_000 },
      { id: 'webhook-retry', every: 60_000 },
      { id: 'creating-recovery', every: 300_000 },
      { id: 'terminal-watch', every: 900_000 },
      { id: 'cancel-retry', every: 900_000 },
      { id: 'outbox-dispatch', every: 30_000 },
      { id: 'guest-checkout-reconcile', every: 60_000 },
    ];
    for (const schedule of schedules) {
      await this.queue.upsertJobScheduler(
        schedule.id,
        { every: schedule.every },
        {
          name: schedule.id,
          data: {},
          opts: { removeOnComplete: 100, removeOnFail: 500 },
        },
      );
    }
  }
}

@Processor(PAYMENTS_QUEUE)
export class PaymentsWorker extends WorkerHost {
  private readonly logger = new Logger(PaymentsWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly coordinator: BookingConfirmationCoordinator,
    private readonly receipts: VerifyReceiptUseCase,
    private readonly inbox: PayosWebhookInbox,
    private readonly gateway: PayosGatewayAdapter,
    private readonly paymentRequests: CreatePaymentRequestUseCase,
    private readonly guestCheckoutReconcile: GuestCheckoutReconcileService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case 'expiry-sweep':
        return this.expirySweep();
      case 'webhook-retry':
        return this.webhookRetry();
      case 'creating-recovery':
        return this.creatingRecovery();
      case 'terminal-watch':
        return this.terminalWatch();
      case 'cancel-retry':
        return this.cancelRetry();
      case 'outbox-dispatch':
        return this.outboxDispatch();
      case 'guest-checkout-reconcile':
        return this.guestCheckoutReconcile.run();
      default:
        this.logger.warn(`Unknown job ${job.name}; ignoring.`);
        return { ignored: true };
    }
  }

  /** Expiry worker: HOLDING quá hạn → EXPIRED + obligations (idempotent). */
  private async expirySweep(): Promise<{ expired: number }> {
    const [clock] = await this.prisma.$queryRaw<{ now: Date }[]>`
      SELECT clock_timestamp() AS now`;
    const due = await this.prisma.booking.findMany({
      where: { status: 'HOLDING', holdExpiresAt: { lte: clock.now } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 200,
    });
    let expired = 0;
    for (const row of due) {
      const outcome = await this.coordinator.expireHoldWithObligations(row.id);
      if (outcome.result === 'EXPIRED') expired += 1;
    }
    return { expired };
  }

  /** Webhook retry: claim due events (RECEIVED/FAILED到期/lease hết) rồi xử lý. */
  private async webhookRetry(): Promise<{ processed: number }> {
    const due = await this.prisma.paymentWebhookEvent.findMany({
      where: {
        OR: [
          { status: 'RECEIVED' },
          { status: 'FAILED', nextRetryAt: { lte: new Date() } },
          { status: 'PROCESSING', nextRetryAt: { lte: new Date() } },
        ],
      },
      select: { id: true },
      orderBy: { receivedAt: 'asc' },
      take: 50,
    });
    let processed = 0;
    for (const row of due) {
      const claim = await this.inbox.claim(row.id);
      if (!claim) continue;
      try {
        await this.processClaimedEvent(row.id);
        await this.inbox.finalize(row.id, claim.generation, 'PROCESSED');
        processed += 1;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'unknown';
        // Phân biệt transient/permanent: lỗi nghiệp vụ đã rõ (conflict,
        // booking terminal) → IGNORED có audit; lỗi hạ tầng → FAILED retry.
        if (/conflict|not found|terminal/i.test(message)) {
          await this.inbox.finalize(
            row.id,
            claim.generation,
            'IGNORED',
            message,
          );
        } else {
          await this.inbox.finalize(
            row.id,
            claim.generation,
            'FAILED',
            message,
          );
        }
      }
    }
    return { processed };
  }

  private async processClaimedEvent(eventId: string): Promise<void> {
    const event = await this.prisma.paymentWebhookEvent.findUniqueOrThrow({
      where: { id: eventId },
    });
    const payload = event.payload as {
      data?: {
        code?: string;
        amount?: number;
        description?: string;
        reference?: string;
        transactionDateTime?: string;
        accountNumber?: string;
      };
    };
    const data = payload.data;
    // Chỉ xử lý signed success có amount; không suy từ outer fields (MIG-06).
    if (!data || data.code !== '00' || typeof data.amount !== 'number') {
      throw new Error('Event thiếu signed success/amount — chuyển đối soát.');
    }
    const paymentCode = this.paymentCodeOf(data.description, data.reference);
    if (!paymentCode)
      throw new Error('Không khớp paymentCode — chuyển đối soát.');
    const request = await this.prisma.paymentRequest.findUnique({
      where: { paymentCode },
      select: { id: true, referenceId: true, amount: true },
    });
    if (!request) throw new Error('Payment request not found.');
    await this.receipts.execute(
      request.referenceId,
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
      `webhook:${eventId}`,
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

  /**
   * C07 creating-recovery: CREATING quá 5 phút mà vẫn chưa có provider link
   * (crash/timeout sau commit, terminal-watch không thấy vì thiếu linkId).
   * - Booking terminal → đóng intent EXPIRED (conditional, không xóa facts).
   * - Booking còn hiệu lực + gateway cấu hình → thử fill link đúng một lần
   *   qua recoverOrphanedIntent (fill-once có điều kiện, thua race thì thôi).
   * - Gateway lỗi/chưa cấu hình → giữ CREATING cho lần quét sau; không bao
   *   giờ suy FAILED ở đây (MIG-09).
   */
  private async creatingRecovery(): Promise<{
    recovered: number;
    expired: number;
  }> {
    if (!this.gateway.isConfigured()) return { recovered: 0, expired: 0 };
    const cutoff = new Date(Date.now() - 5 * 60_000);
    const orphans = await this.prisma.paymentRequest.findMany({
      where: {
        status: 'CREATING',
        providerPaymentLinkId: null,
        updatedAt: { lt: cutoff },
      },
      select: { id: true, referenceId: true },
      orderBy: { updatedAt: 'asc' },
      take: 50,
    });
    let recovered = 0;
    let expired = 0;
    for (const row of orphans) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: row.referenceId },
        select: { status: true },
      });
      if (
        !booking ||
        booking.status === 'EXPIRED' ||
        booking.status === 'CANCELLED'
      ) {
        const closed = await this.prisma.paymentRequest.updateMany({
          where: { id: row.id, status: 'CREATING' },
          data: { status: 'EXPIRED' },
        });
        expired += closed.count;
        continue;
      }
      try {
        const result = await this.paymentRequests.recoverOrphanedIntent(row.id);
        if (result && result.status !== 'CREATING') recovered += 1;
      } catch {
        // Provider/db tạm lỗi → lần quét sau; không đổi state nội bộ.
      }
    }
    return { recovered, expired };
  }

  /**
   * Terminal-watch (MIG-08): query provider NGOÀI tx cho request live quá
   * 15 phút; áp kết quả qua canonical receipt path sau recheck. Chưa cấu
   * hình provider → skip (không suy gì cả).
   */
  private async terminalWatch(): Promise<{ checked: number }> {
    if (!this.gateway.isConfigured()) return { checked: 0 };
    const cutoff = new Date(Date.now() - 15 * 60_000);
    const live = await this.prisma.paymentRequest.findMany({
      where: {
        status: { in: ['CREATING', 'PENDING', 'PARTIALLY_PAID'] },
        providerPaymentLinkId: { not: null },
        updatedAt: { lt: cutoff },
      },
      select: { id: true, referenceId: true, providerPaymentLinkId: true },
      take: 50,
    });
    let checked = 0;
    for (const row of live) {
      try {
        const link = await this.gateway.getLink(
          row.providerPaymentLinkId as string,
        );
        checked += 1;
        for (const transaction of link.transactions ?? []) {
          if (typeof transaction.amount !== 'number') continue;
          try {
            await this.receipts.execute(
              row.referenceId,
              {
                receivingAccountKey: `PAYOS:${transaction.accountNumber ?? 'unknown'}`,
                transactionReference: transaction.reference ?? null,
                amount: transaction.amount,
                currency: 'VND',
                fundsReceivedAt: transaction.transactionDateTime
                  ? new Date(transaction.transactionDateTime)
                  : new Date(),
                paymentRequestId: row.id,
                confirmationSource: 'PROVIDER_QUERY',
                recordedByUserId: null,
              },
              `provider-query:${row.id}:${transaction.reference ?? transaction.transactionDateTime}`,
            );
          } catch {
            // Duplicate/conflict → canonical path đã xử lý; tiếp tục.
          }
        }
        if (['CANCELLED', 'EXPIRED', 'FAILED'].includes(link.status)) {
          await this.prisma.paymentRequest.updateMany({
            where: {
              id: row.id,
              status: { in: ['CREATING', 'PENDING', 'PARTIALLY_PAID'] },
            },
            data: { status: link.status === 'FAILED' ? 'FAILED' : 'EXPIRED' },
          });
        }
      } catch {
        // Provider tạm lỗi → lần quét sau; không đổi state nội bộ.
      }
    }
    return { checked };
  }

  /** Cancel-retry best-effort cho link của booking đã terminal. */
  private async cancelRetry(): Promise<{ cancelled: number }> {
    const stale = await this.prisma.paymentRequest.findMany({
      where: {
        status: { in: ['CREATING', 'PENDING', 'PARTIALLY_PAID'] },
        providerPaymentLinkId: { not: null },
        booking: { status: { in: ['EXPIRED', 'CANCELLED'] } },
      },
      select: { id: true, providerPaymentLinkId: true, paymentCode: true },
      take: 50,
    });
    let cancelled = 0;
    for (const row of stale) {
      const ok = await this.gateway.cancelLink(
        row.providerPaymentLinkId as string,
        `Booking terminal (${row.paymentCode})`,
      );
      if (!ok) continue;
      const changed = await this.prisma.paymentRequest.updateMany({
        where: {
          id: row.id,
          status: { in: ['CREATING', 'PENDING', 'PARTIALLY_PAID'] },
        },
        data: { status: 'CANCELLED' },
      });
      cancelled += changed.count;
    }
    return { cancelled };
  }

  /**
   * Outbox dispatcher: claim batch chưa publish đến hạn; CHƯA có message
   * sink thật trong scope này → reschedule backoff có chặn, quarantine sau
   * MAX_OUTBOX_ATTEMPTS cho ops xử lý (không mark published giả).
   */
  private async outboxDispatch(): Promise<{
    claimed: number;
    quarantined: number;
  }> {
    const due = await this.prisma.outboxEvent.findMany({
      where: {
        publishedAt: null,
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
      },
      orderBy: { occurredAt: 'asc' },
      take: 100,
    });
    let quarantined = 0;
    for (const event of due) {
      if (event.attemptCount >= MAX_OUTBOX_ATTEMPTS) {
        // BLK quarantine starvation: nextRetryAt far-future thay NULL để batch
        // sau không chọn lại rows đã quarantine.
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            lastError: 'OUTBOX_QUARANTINED: quá số lần publish, chờ ops xử lý.',
            nextRetryAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
          },
        });
        quarantined += 1;
        continue;
      }
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          attemptCount: { increment: 1 },
          nextRetryAt: new Date(Date.now() + 60_000),
          lastError: 'OUTBOX_PENDING_SINK: chưa có message sink, giữ durable.',
        },
      });
    }
    return { claimed: due.length, quarantined };
  }
}
