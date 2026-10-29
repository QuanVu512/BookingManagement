import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { TransactionContext } from '../../../infrastructure/prisma/transaction-context.js';
import { RedisService } from '../../../infrastructure/redis/redis.service.js';
import { invalidateCourtDayCache } from '../../bookings/application/get-court-day-occupancies.use-case.js';
import {
  isCheckoutOperationAllowed,
  resolveCheckoutTokenCapabilities,
} from '../domain/guest-checkout-token-policy.js';
import { PAYMENT_TRANSACTION_OPTIONS } from '../payment.constants.js';

export interface CancelGuestHoldResult {
  bookingId: string;
  bookingCode: string;
  status: 'CANCELLED' | 'EXPIRED';
  holdExpiresAt: string;
  cancelledAt: string | null;
  serverNow: string;
  /** true khi đơn đã terminal từ trước; thao tác vẫn idempotent thành công. */
  idempotent: boolean;
}

interface LockedHoldRow {
  id: string;
  booking_code: string;
  court_id: string;
  user_id: string | null;
  status: string;
  created_at: Date;
  hold_expires_at: Date;
  cancelled_at: Date | null;
}

const PAID_BOOKING_STATUSES = new Set([
  'CONFIRMED',
  'CHECKED_IN',
  'COMPLETED',
  'NO_SHOW',
]);

/**
 * Task 2.3 — Guest tự hủy giữ chỗ bằng CheckoutRecoveryToken.
 *
 * - Cùng advisory lock `booking-money` với webhook/expiry để payment commit và
 *   cancel không chen nhau; sau lock mới đọc `clock_timestamp()`.
 * - `SELECT ... FOR UPDATE` trên booking là khóa bi quan thứ hai theo plan.
 * - CANCELLED/EXPIRED → idempotent success; CONFIRMED/đã thu tiền → 409
 *   ALREADY_PAID; HOLDING trong cửa sổ hold → CANCELLED + RELEASED occupancy
 *   + history; HOLDING đã quá `hold_expires_at` → 409 CHECKOUT_READ_ONLY
 *   (Contract F2: token còn hạn nhưng mutation đã khóa).
 * - Payment request chưa thu tiền: CREATING đóng ngay; PENDING còn provider
 *   link để worker `cancel-retry` hủy link rồi đóng (tránh I/O ngoài lock).
 */
@Injectable()
export class CancelGuestHoldUseCase {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  async execute(bookingId: string): Promise<CancelGuestHoldResult> {
    const committed = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtext('booking-money'),
          hashtext(${bookingId})
        )`;
      const rows = await transaction.$queryRaw<LockedHoldRow[]>`
        SELECT id, booking_code, court_id, user_id, status::text AS status,
               created_at, hold_expires_at, cancelled_at
        FROM bookings
        WHERE id = ${bookingId}::uuid
        FOR UPDATE`;
      const booking = rows[0];
      if (!booking || booking.user_id !== null) {
        throw new NotFoundException({
          code: 'BOOKING_NOT_FOUND',
          message: 'Không tìm thấy đơn giữ chỗ.',
        });
      }

      const [clock] = await transaction.$queryRaw<{ now: Date }[]>`
        SELECT clock_timestamp() AS now`;
      const now = clock.now;

      if (booking.status === 'CANCELLED' || booking.status === 'EXPIRED') {
        await this.releaseOccupancy(transaction, booking.id, now);
        return {
          result: this.present(booking, now, true),
          courtId: booking.court_id,
        };
      }

      if (PAID_BOOKING_STATUSES.has(booking.status)) {
        throw new ConflictException({
          code: 'ALREADY_PAID',
          message:
            'Đơn đã thanh toán hoặc đã xác nhận — không thể hủy giữ chỗ.',
        });
      }

      if (booking.status !== 'HOLDING') {
        throw new ConflictException({
          code: 'BOOKING_NOT_HOLDING',
          message: 'Đơn không còn ở trạng thái giữ chỗ.',
        });
      }

      await this.assertNoReceivedFunds(transaction, booking.id);

      const capabilities = resolveCheckoutTokenCapabilities({
        holdIssuedAt: booking.created_at,
        holdExpiresAt: booking.hold_expires_at,
        serverNow: now,
      });
      if (!isCheckoutOperationAllowed(capabilities, 'CANCEL_HOLD')) {
        // AC-15: quá cửa sổ hold thì chỉ còn quyền đọc; không release
        // occupancy, không đóng payment request, không đổi trạng thái.
        throw new ConflictException({
          code: 'CHECKOUT_READ_ONLY',
          message:
            'Thời gian giữ chỗ đã hết — đơn chỉ còn có thể xem trạng thái.',
        });
      }

      const nextStatus: 'CANCELLED' | 'EXPIRED' =
        now.getTime() >= booking.hold_expires_at.getTime()
          ? 'EXPIRED'
          : 'CANCELLED';

      const changed = await transaction.booking.updateMany({
        where: { id: booking.id, status: 'HOLDING' },
        data:
          nextStatus === 'CANCELLED'
            ? {
                status: 'CANCELLED',
                cancelledAt: now,
                cancellationReason: 'GUEST_CANCEL_HOLD',
                version: { increment: 1 },
              }
            : { status: 'EXPIRED', version: { increment: 1 } },
      });
      if (changed.count === 0) {
        // Không thể xảy ra dưới row lock, nhưng giữ nhánh an toàn.
        throw new ConflictException({
          code: 'CANCEL_HOLD_RACE',
          message: 'Trạng thái đơn vừa thay đổi. Vui lòng tải lại.',
        });
      }

      await this.releaseOccupancy(transaction, booking.id, now);
      await transaction.bookingStatusHistory.create({
        data: {
          bookingId: booking.id,
          fromStatus: 'HOLDING',
          toStatus: nextStatus,
          actorType: nextStatus === 'CANCELLED' ? 'GUEST' : 'SYSTEM',
        },
      });
      await this.cancelUnpaidRequests(transaction, booking.id);

      return {
        result: this.present(
          {
            ...booking,
            status: nextStatus,
            cancelled_at: nextStatus === 'CANCELLED' ? now : null,
          },
          now,
          false,
        ),
        courtId: booking.court_id,
      };
    }, PAYMENT_TRANSACTION_OPTIONS);
    // Day-grid invalidation after commit (fail-open). The idempotent replay
    // path also releases occupancy defensively, so invalidate for it as well.
    await invalidateCourtDayCache(this.redis, committed.courtId);
    return committed.result;
  }

  /**
   * Chặn hủy khi đã có tiền vào (kể cả PARTIALLY_PAID hoặc receipt đã
   * REFUND_REQUIRED). Không đọc provider; DB là nguồn sự thật.
   */
  private async assertNoReceivedFunds(
    transaction: TransactionContext,
    bookingId: string,
  ): Promise<void> {
    const paidRequest = await transaction.paymentRequest.findFirst({
      where: {
        referenceId: bookingId,
        status: { in: ['PAID', 'PARTIALLY_PAID'] },
      },
      select: { id: true },
    });
    const verifiedReceipt = await transaction.paymentTransaction.findFirst({
      where: {
        paymentRequest: { referenceId: bookingId },
        verificationStatus: 'VERIFIED',
      },
      select: { id: true },
    });
    if (paidRequest || verifiedReceipt) {
      throw new ConflictException({
        code: 'ALREADY_PAID',
        message: 'Đơn đã có giao dịch thanh toán — cần đối soát thay vì hủy.',
      });
    }
  }

  private async releaseOccupancy(
    transaction: TransactionContext,
    bookingId: string,
    now: Date,
  ): Promise<void> {
    await transaction.courtOccupancy.updateMany({
      where: { bookingId, state: 'ACTIVE' },
      data: { state: 'RELEASED', releasedAt: now },
    });
  }

  /**
   * CREATING chưa có link → đóng ngay. PENDING còn provider link được để
   * `cancel-retry` hủy link rồi chuyển CANCELLED; PENDING không link đóng ngay.
   */
  private async cancelUnpaidRequests(
    transaction: TransactionContext,
    bookingId: string,
  ): Promise<void> {
    await transaction.paymentRequest.updateMany({
      where: {
        referenceId: bookingId,
        status: 'CREATING',
      },
      data: { status: 'CANCELLED' },
    });
    await transaction.paymentRequest.updateMany({
      where: {
        referenceId: bookingId,
        status: 'PENDING',
        providerPaymentLinkId: null,
      },
      data: { status: 'CANCELLED' },
    });
  }

  private present(
    booking: LockedHoldRow,
    now: Date,
    idempotent: boolean,
  ): CancelGuestHoldResult {
    return {
      bookingId: booking.id,
      bookingCode: booking.booking_code,
      status: booking.status as 'CANCELLED' | 'EXPIRED',
      holdExpiresAt: booking.hold_expires_at.toISOString(),
      cancelledAt: booking.cancelled_at?.toISOString() ?? null,
      serverNow: now.toISOString(),
      idempotent,
    };
  }
}
