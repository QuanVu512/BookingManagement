import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import {
  BookingConfirmationMailService,
  type BookingConfirmationMailContent,
} from '../infrastructure/booking-confirmation-mail.service.js';

export const BOOKING_CONFIRMATION_MAIL_BATCH = 20;
export const BOOKING_CONFIRMATION_MAX_PER_RUN = 100;
export const BOOKING_CONFIRMATION_MAX_ATTEMPTS = 10;
const BOOKING_CONFIRMATION_BACKOFF_MS = [
  15_000, 30_000, 60_000, 120_000, 300_000,
];
const BOOKING_CONFIRMATION_QUARANTINE_MS = 7 * 24 * 60 * 60_000;
const BOOKING_CONFIRMED_EVENT = 'booking.confirmed';

export interface BookingConfirmationMailBatchResult {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  retried: number;
}

export function bookingConfirmationDedupKey(bookingId: string): string {
  return `${BOOKING_CONFIRMED_EVENT}:${bookingId}`;
}

/**
 * Worker gửi thư xác nhận đặt sân (job `booking-confirmation-mail`).
 * PostgreSQL là source of truth; BullMQ chỉ là trigger lịch.
 * - Tiêu thụ `OutboxEvent booking.confirmed` đã ghi cùng transaction
 *   chuyển HOLDING → CONFIRMED; không gửi mail trong transaction.
 * - Mỗi booking đúng một email: `NotificationDelivery` với dedup key
 *   `booking.confirmed:{bookingId}` (unique) làm hàng rào; worker concurrent
 *   thứ hai nhận P2002 thì bỏ qua, không gửi trùng.
 * - SMTP lỗi → retry theo backoff, KHÔNG rollback trạng thái CONFIRMED.
 */
@Injectable()
export class BookingConfirmationMailWorker {
  private readonly logger = new Logger(BookingConfirmationMailWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: BookingConfirmationMailService,
  ) {}

  async runOnce(
    now: Date = new Date(),
  ): Promise<BookingConfirmationMailBatchResult> {
    const result: BookingConfirmationMailBatchResult = {
      claimed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      retried: 0,
    };
    let processed = 0;
    for (;;) {
      const due = await this.claimDue(now);
      if (!due.length) break;
      result.claimed += due.length;
      for (const eventId of due) {
        const outcome = await this.processOne(eventId, now);
        if (outcome === 'sent') result.sent += 1;
        else if (outcome === 'skipped') result.skipped += 1;
        else if (outcome === 'failed') result.failed += 1;
        else result.retried += 1;
        processed += 1;
        if (processed >= BOOKING_CONFIRMATION_MAX_PER_RUN) break;
      }
      if (processed >= BOOKING_CONFIRMATION_MAX_PER_RUN) break;
    }
    return result;
  }

  private async claimDue(now: Date): Promise<string[]> {
    const due = await this.prisma.outboxEvent.findMany({
      where: {
        eventType: BOOKING_CONFIRMED_EVENT,
        publishedAt: null,
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      orderBy: { occurredAt: 'asc' },
      take: BOOKING_CONFIRMATION_MAIL_BATCH,
      select: { id: true },
    });
    return due.map((row) => row.id);
  }

  private async processOne(
    eventId: string,
    now: Date,
  ): Promise<'sent' | 'skipped' | 'failed' | 'retried'> {
    const event = await this.prisma.outboxEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        eventType: true,
        aggregateId: true,
        publishedAt: true,
        attemptCount: true,
      },
    });
    if (
      !event ||
      event.eventType !== BOOKING_CONFIRMED_EVENT ||
      event.publishedAt !== null
    )
      return 'skipped';
    const bookingId = event.aggregateId;

    // Hàng rào đúng-một-lần: booking đã có delivery thì không gửi lại
    // (webhook gọi lại / confirm lặp qua CAS ALREADY_CONFIRMED).
    const dedupKey = bookingConfirmationDedupKey(bookingId);
    const existing = await this.prisma.notificationDelivery.findUnique({
      where: { deduplicationKey: dedupKey },
      select: { id: true, status: true },
    });
    if (existing && existing.status === 'SENT') {
      await this.markPublished(eventId, now);
      return 'skipped';
    }
    if (!existing) {
      const created = await this.tryCreateDelivery(bookingId, dedupKey);
      if (!created) {
        // Worker khác vừa tạo trước (thua race) → bỏ qua, không gửi trùng.
        await this.markPublished(eventId, now);
        return 'skipped';
      }
    } else {
      const claimed = await this.prisma.notificationDelivery.updateMany({
        where: {
          deduplicationKey: dedupKey,
          status: { in: ['QUEUED', 'FAILED'] },
        },
        data: { status: 'SENDING', attemptCount: { increment: 1 } },
      });
      if (!claimed.count) {
        await this.markPublished(eventId, now);
        return 'skipped';
      }
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        bookingCode: true,
        status: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        startsAt: true,
        endsAt: true,
        totalAmount: true,
        requiredPrepaymentAmount: true,
        userId: true,
        court: { select: { name: true } },
        customer: {
          select: {
            email: true,
            profile: { select: { fullName: true } },
          },
        },
      },
    });
    if (!booking || String(booking.status) !== 'CONFIRMED') {
      await this.finishDelivery(
        dedupKey,
        'FAILED',
        'BOOKING_NOT_CONFIRMED',
        null,
      );
      await this.markPublished(eventId, now, 'BOOKING_NOT_CONFIRMED');
      return 'skipped';
    }

    const content = this.toMailContent(booking);
    if (!content) {
      await this.finishDelivery(dedupKey, 'FAILED', 'RECIPIENT_MISSING', null);
      await this.markPublished(eventId, now, 'RECIPIENT_MISSING');
      return 'failed';
    }

    try {
      await this.mail.sendConfirmationMail(content);
    } catch {
      const attempts = event.attemptCount + 1;
      if (attempts >= BOOKING_CONFIRMATION_MAX_ATTEMPTS) {
        await this.finishDelivery(
          dedupKey,
          'FAILED',
          'SMTP_DELIVERY_FAILED',
          null,
        );
        await this.markQuarantined(eventId, now);
        return 'failed';
      }
      const backoff =
        BOOKING_CONFIRMATION_BACKOFF_MS[
          Math.min(attempts, BOOKING_CONFIRMATION_BACKOFF_MS.length) - 1
        ] ?? BOOKING_CONFIRMATION_BACKOFF_MS[0];
      const nextRetryAt = new Date(now.getTime() + backoff);
      await this.finishDelivery(
        dedupKey,
        'FAILED',
        'SMTP_DELIVERY_FAILED',
        nextRetryAt,
      );
      await this.markRetried(eventId, attempts, nextRetryAt, now);
      return 'retried';
    }

    await this.finishDelivery(dedupKey, 'SENT', null, null, now);
    await this.markPublished(eventId, now);
    return 'sent';
  }

  private toMailContent(booking: {
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    bookingCode: string;
    startsAt: Date;
    endsAt: Date;
    totalAmount: unknown;
    requiredPrepaymentAmount: unknown;
    userId: string | null;
    court: { name: string } | null;
    customer: { email: string; profile: { fullName: string } | null } | null;
  }): BookingConfirmationMailContent | null {
    const isMember = booking.userId !== null;
    const to = isMember
      ? (booking.customer?.email ?? booking.customerEmail)
      : booking.customerEmail;
    if (!to || !to.includes('@')) return null;
    const recipientName =
      isMember && booking.customer?.profile?.fullName
        ? booking.customer.profile.fullName
        : booking.customerName;
    const totalAmount = Number(booking.totalAmount);
    const depositPaid = Number(booking.requiredPrepaymentAmount);
    return {
      to,
      recipientName,
      recipientPhone: booking.customerPhone,
      bookingCode: booking.bookingCode,
      courtName: booking.court?.name ?? '',
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      totalAmount,
      depositPaid,
      remainingAmount: Math.max(totalAmount - depositPaid, 0),
      isMember,
    };
  }

  private async tryCreateDelivery(
    bookingId: string,
    dedupKey: string,
  ): Promise<boolean> {
    try {
      await this.prisma.notificationDelivery.create({
        data: {
          bookingId,
          recipientEmail: '',
          templateCode: 'BOOKING_CONFIRMED',
          deduplicationKey: dedupKey,
          status: 'SENDING',
          attemptCount: 1,
        },
        select: { id: true },
      });
      return true;
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        return false;
      }
      this.logger.warn(
        `Không tạo được notification delivery cho booking ${bookingId}.`,
      );
      throw error;
    }
  }

  private async finishDelivery(
    dedupKey: string,
    status: 'SENT' | 'FAILED',
    lastError: string | null,
    nextRetryAt: Date | null,
    sentAt?: Date,
  ): Promise<void> {
    await this.prisma.notificationDelivery.updateMany({
      where: { deduplicationKey: dedupKey },
      data: {
        status,
        lastError,
        ...(status === 'SENT' ? { sentAt: sentAt ?? new Date() } : {}),
        nextRetryAt,
      },
    });
  }

  private async markPublished(
    eventId: string,
    now: Date,
    lastError?: string,
  ): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id: eventId },
      data: {
        publishedAt: now,
        ...(lastError ? { lastError } : {}),
        nextRetryAt: null,
      },
    });
  }

  private async markRetried(
    eventId: string,
    attempts: number,
    nextRetryAt: Date,
    now: Date,
  ): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id: eventId },
      data: {
        attemptCount: attempts,
        nextRetryAt,
        lastError: 'SMTP_DELIVERY_FAILED',
        occurredAt: now,
      },
    });
  }

  private async markQuarantined(eventId: string, now: Date): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id: eventId },
      data: {
        lastError: 'OUTBOX_QUARANTINED: quá số lần gửi mail xác nhận.',
        nextRetryAt: new Date(
          now.getTime() + BOOKING_CONFIRMATION_QUARANTINE_MS,
        ),
      },
    });
  }
}
