import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { summarizeBookingMoney } from '../domain/money.js';
import {
  resolvePaymentOutcome,
  type OutcomeFacts,
} from './payment-status-resolver.js';

/**
 * BE-PAY-06 — Payment outcome chuẩn (MIG-14).
 * Mọi facts suy từ DB server; redirect/browser status không có giá trị.
 * Ownership: booking.userId = subject, hoặc guest token đã bind booking.
 */
export interface PaymentStatusDto {
  id: string;
  paymentCode: string;
  status: string;
  paidAmount: number;
  remainingAmount: number;
  netCredited: number;
  requiredPrepaymentAmount: number;
  serverNow: string;
  bookingStatus: string;
  reviewRequired: boolean;
  reviewReasonCode: string | null;
  screen: string;
}

export interface RefundTrackerItem {
  id: string;
  status: string;
  amount: number;
  reasonType: string;
  outcomeCode:
    | 'COMPLETED'
    | 'REJECTED'
    | 'CANCELLED'
    | 'UNKNOWN'
    | 'FAILED'
    | 'PROCESSING';
  actionRequired: string | null;
  destinationAccountLast4: string | null;
  bankTransactionReference: string | null;
}

export interface BookingPaymentDetail {
  id: string;
  bookingCode: string;
  status: string;
  startsAt: string;
  endsAt: string;
  holdExpiresAt: string | null;
  prepaymentPercent: number;
  customer: { name: string; phone?: string; email?: string };
  paymentSummary: {
    totalAmount: number;
    paidAmount: number;
    refundedAmount: number;
    reservedRefundAmount: number;
    balanceAmount: number;
    currency: string;
  };
  transactions: {
    id: string;
    amount: number;
    currency: string;
    method: string;
    provider: string | null;
    transactionReference: string | null;
    verificationStatus: string;
    allocationStatus: string;
    recordedAt: string;
  }[];
  activePaymentRequest: {
    id: string;
    paymentCode: string;
    status: string;
    amount: number;
    checkoutUrl: string | null;
    /**
     * C07 — true khi intent CREATING nhưng chưa có checkoutUrl (provider
     * create chưa hoàn tất sau commit). UI dùng để đề xuất tạo lại thanh
     * toán thay vì hiển thị trạng thái chờ chết.
     */
    recoveryRequired: boolean;
  } | null;
  activeRefunds: { refundRequestId: string; amount: number; status: string }[];
}

@Injectable()
export class PaymentOutcomeService {
  constructor(private readonly prisma: PrismaService) {}

  /** true khi subject sở hữu booking; IDOR → false (caller trả 404). */
  async ownsBooking(
    bookingId: string,
    subject: { userId: string | null; guestBookingId?: string },
  ): Promise<boolean> {
    if (subject.guestBookingId === bookingId) return true;
    if (!subject.userId) return false;
    const row = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId: subject.userId },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * E1 quote read-only (BE-PAY-06): chỉ HOLDING; số từ snapshot server.
   * Hết hold → 410 PAYMENT_HOLD_EXPIRED; không HOLDING → 409.
   */
  async quoteForBooking(
    bookingId: string,
    subject: { userId: string | null; guestBookingId?: string },
  ): Promise<
    | { quote: unknown; error?: undefined }
    | { quote?: undefined; error: { code: string; message?: string } }
    | null
  > {
    if (!(await this.ownsBooking(bookingId, subject))) return null;
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) return null;
    const [clock] = await this.prisma.$queryRaw<{ now: Date }[]>`
      SELECT clock_timestamp() AS now`;
    const serverNow = clock.now;
    if (String(booking.status) !== 'HOLDING') {
      return { error: { code: 'BOOKING_NOT_HOLDING' } };
    }
    if (!(serverNow < booking.holdExpiresAt)) {
      return { error: { code: 'PAYMENT_HOLD_EXPIRED' } };
    }
    const total = Number(booking.totalAmount.toString());
    const required = Number(booking.requiredPrepaymentAmount.toString());
    return {
      quote: {
        bookingId,
        totalAmount: total,
        prepaymentAmount: required,
        balanceAmount: Math.max(total - required, 0),
        requiredPrepaymentAmount: required,
        currency: booking.currency,
        holdExpiresAt: booking.holdExpiresAt.toISOString(),
        serverNow: serverNow.toISOString(),
      },
    };
  }

  async statusForRequest(
    requestId: string,
    subject: { userId: string | null; guestBookingId?: string },
  ): Promise<PaymentStatusDto | null> {
    const request = await this.prisma.paymentRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) return null;
    if (!(await this.ownsBooking(request.referenceId, subject))) return null;
    return this.buildStatus(request.referenceId, {
      id: request.id,
      paymentCode: request.paymentCode,
      status: String(request.status),
    });
  }

  async latestForBooking(
    bookingId: string,
    purpose: 'PREPAYMENT' | 'BALANCE' | undefined,
    subject: { userId: string | null; guestBookingId?: string },
  ) {
    if (!(await this.ownsBooking(bookingId, subject))) return null;
    const request = await this.prisma.paymentRequest.findFirst({
      where: {
        referenceId: bookingId,
        ...(purpose ? { purpose } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!request) return null;
    return this.buildStatus(bookingId, {
      id: request.id,
      paymentCode: request.paymentCode,
      status: String(request.status),
    });
  }

  async refundsForBooking(
    bookingId: string,
    subject: { userId: string | null; guestBookingId?: string },
  ): Promise<{ items: RefundTrackerItem[] } | null> {
    if (!(await this.ownsBooking(bookingId, subject))) return null;
    const refunds = await this.prisma.refundRequest.findMany({
      where: {
        paymentTransaction: { paymentRequest: { referenceId: bookingId } },
      },
      orderBy: { createdAt: 'desc' },
      include: { attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 } },
    });
    return {
      items: refunds.map((refund) => {
        const latest = refund.attempts[0];
        const attemptStatus = latest ? String(latest.status) : null;
        // MIG-16: phân biệt UNKNOWN/FAILED, destination-needed; không lộ payload.
        let outcomeCode: RefundTrackerItem['outcomeCode'] = 'PROCESSING';
        let actionRequired: string | null = null;
        const status = String(refund.status);
        if (status === 'COMPLETED') outcomeCode = 'COMPLETED';
        else if (status === 'REJECTED') outcomeCode = 'REJECTED';
        else if (status === 'CANCELLED') outcomeCode = 'CANCELLED';
        else if (attemptStatus === 'UNKNOWN') {
          outcomeCode = 'UNKNOWN';
          actionRequired =
            'Yêu cầu hoàn đang được kiểm tra — không chuyển tiền lại.';
        } else if (attemptStatus === 'FAILED') {
          outcomeCode = 'FAILED';
          actionRequired =
            'Lệnh hoàn chưa thành công — hệ thống đang đối soát.';
        } else if (!refund.destinationBankBin) {
          actionRequired = 'Cần bổ sung tài khoản nhận hoàn.';
        }
        return {
          id: refund.id,
          status,
          amount: Number(refund.amount.toString()),
          reasonType: String(refund.reasonType),
          outcomeCode,
          actionRequired,
          destinationAccountLast4: refund.destinationAccountLast4,
          // bankTransactionReference chỉ hiện khi COMPLETED (E11).
          bankTransactionReference:
            status === 'COMPLETED'
              ? (latest?.bankTransactionReference ?? null)
              : null,
        };
      }),
    };
  }

  /**
   * E4 — Booking detail kèm payment (§4.4.4). Customer view mask
   * transactionReference (chỉ last4); staff view qua E12 riêng.
   * IDOR → null (caller 404).
   */
  async bookingDetail(
    bookingId: string,
    subject: { userId: string | null; guestBookingId?: string },
  ): Promise<BookingPaymentDetail | null> {
    if (!(await this.ownsBooking(bookingId, subject))) return null;
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) return null;
    const receipts = await this.prisma.paymentTransaction.findMany({
      where: { paymentRequest: { referenceId: bookingId } },
      orderBy: { createdAt: 'asc' },
    });
    const receiptIds = receipts.map((receipt) => receipt.id);
    const refunds = await this.prisma.refundRequest.findMany({
      where: { paymentTransactionId: { in: receiptIds } },
    });
    const completed = refunds.filter(
      (refund) => String(refund.status) === 'COMPLETED',
    );
    const reserved = refunds.filter((refund) =>
      ['REQUESTED', 'APPROVED', 'PROCESSING'].includes(String(refund.status)),
    );
    const allocated = receipts
      .filter((receipt) => String(receipt.allocationStatus) === 'ALLOCATED')
      .map((receipt) => Number(receipt.amount.toString()));
    const summary = summarizeBookingMoney({
      totalAmount: Number(booking.totalAmount.toString()),
      allocatedReceiptAmounts: allocated,
      completedRefundAmounts: completed.map((refund) =>
        Number(refund.amount.toString()),
      ),
    });
    const activeRequest = await this.prisma.paymentRequest.findFirst({
      where: {
        referenceId: bookingId,
        status: { in: ['CREATING', 'PENDING', 'PARTIALLY_PAID'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      id: booking.id,
      bookingCode: booking.bookingCode,
      status: String(booking.status),
      startsAt: booking.startsAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
      holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null,
      prepaymentPercent: Number(booking.prepaymentPercent.toString()),
      customer: {
        name: booking.customerName,
        phone:
          subject.userId || subject.guestBookingId
            ? booking.customerPhone
            : undefined,
        email:
          subject.userId || subject.guestBookingId
            ? booking.customerEmail
            : undefined,
      },
      paymentSummary: {
        totalAmount: summary.total,
        paidAmount: summary.netCredited,
        refundedAmount: summary.refundedCompleted,
        reservedRefundAmount: reserved.reduce(
          (sum, refund) => sum + Number(refund.amount.toString()),
          0,
        ),
        // MIG-02 thắng §4.4.4: dư nợ còn hiệu lực cả khi CONFIRMED
        // (cọc 45k → CONFIRMED vẫn thu 105k).
        balanceAmount: summary.balanceDue,
        currency: booking.currency,
      },
      transactions: receipts.map((receipt) => ({
        id: receipt.id,
        amount: Number(receipt.amount.toString()),
        currency: receipt.currency,
        method: String(receipt.method),
        provider: receipt.provider,
        transactionReference: receipt.transactionReference
          ? `****${receipt.transactionReference.slice(-4)}`
          : null,
        verificationStatus: String(receipt.verificationStatus),
        allocationStatus: String(receipt.allocationStatus),
        recordedAt: receipt.createdAt.toISOString(),
      })),
      activePaymentRequest: activeRequest
        ? {
            id: activeRequest.id,
            paymentCode: activeRequest.paymentCode,
            status: String(activeRequest.status),
            amount: Number(activeRequest.amount.toString()),
            checkoutUrl: activeRequest.checkoutUrl,
            // C07: CREATING không link = intent mồ côi sau crash — UI đề xuất
            // tạo lại thay vì chờ. Các trạng thái khác giữ nguyên hành vi.
            recoveryRequired:
              String(activeRequest.status) === 'CREATING' &&
              activeRequest.checkoutUrl == null,
          }
        : null,
      activeRefunds: refunds
        .filter((refund) =>
          ['REQUESTED', 'APPROVED', 'PROCESSING'].includes(
            String(refund.status),
          ),
        )
        .map((refund) => ({
          refundRequestId: refund.id,
          amount: Number(refund.amount.toString()),
          status: String(refund.status),
        })),
    };
  }

  /**
   * E12 — Staff lookup theo bookingCode/phone (masked).
   * Trả null khi không khớp (caller 404, không phân biệt tồn tại/quyền).
   */
  async staffLookup(query: string): Promise<{
    bookingId: string;
    queryKind: 'CODE' | 'PHONE';
    dto: {
      bookingId: string;
      bookingCode: string;
      customerName: string;
      customerPhoneLast4: string;
      status: string;
      startsAt: string;
      paymentSummary: BookingPaymentDetail['paymentSummary'];
    };
  } | null> {
    const trimmed = query.trim();
    if (trimmed.length < 4 || trimmed.length > 32) return null;
    const isPhone = /^[0-9+\s]{6,20}$/.test(trimmed);
    const booking = isPhone
      ? await this.prisma.booking.findFirst({
          where: { customerPhone: trimmed.replace(/\s/g, '') },
          orderBy: { createdAt: 'desc' },
        })
      : await this.prisma.booking.findUnique({
          where: { bookingCode: trimmed.toUpperCase() },
        });
    if (!booking) return null;
    const receipts = await this.prisma.paymentTransaction.findMany({
      where: {
        paymentRequest: { referenceId: booking.id },
        verificationStatus: 'VERIFIED',
        allocationStatus: 'ALLOCATED',
      },
      select: { amount: true, id: true },
    });
    const ids = receipts.map((receipt) => receipt.id);
    const completed =
      ids.length === 0
        ? []
        : await this.prisma.refundRequest.findMany({
            where: { paymentTransactionId: { in: ids }, status: 'COMPLETED' },
            select: { amount: true },
          });
    // C07 — refund-sum fix: reserved gồm REQUESTED/APPROVED/PROCESSING
    // (đồng nhất với bookingDetail), không hardcode 0.
    const reserved =
      ids.length === 0
        ? []
        : await this.prisma.refundRequest.findMany({
            where: {
              paymentTransactionId: { in: ids },
              status: { in: ['REQUESTED', 'APPROVED', 'PROCESSING'] },
            },
            select: { amount: true },
          });
    const summary = summarizeBookingMoney({
      totalAmount: Number(booking.totalAmount.toString()),
      allocatedReceiptAmounts: receipts.map((receipt) =>
        Number(receipt.amount.toString()),
      ),
      completedRefundAmounts: completed.map((refund) =>
        Number(refund.amount.toString()),
      ),
    });
    return {
      bookingId: booking.id,
      queryKind: isPhone ? 'PHONE' : 'CODE',
      dto: {
        bookingId: booking.id,
        bookingCode: booking.bookingCode,
        customerName: booking.customerName,
        customerPhoneLast4: booking.customerPhone.slice(-4),
        status: String(booking.status),
        startsAt: booking.startsAt.toISOString(),
        paymentSummary: {
          totalAmount: summary.total,
          paidAmount: summary.netCredited,
          refundedAmount: summary.refundedCompleted,
          reservedRefundAmount: reserved.reduce(
            (sum, refund) => sum + Number(refund.amount.toString()),
            0,
          ),
          balanceAmount: summary.balanceDue,
          currency: booking.currency,
        },
      },
    };
  }

  /**
   * Contract F4 — outcome server-side cho recovery snapshot, kể cả khi booking
   * chưa có payment request (terminal summary). Trả null khi booking không tồn
   * tại; caller quyết định mã lỗi.
   */
  async bookingOutcome(bookingId: string): Promise<{
    screen: string;
    reviewRequired: boolean;
    reviewReasonCode: string | null;
    netCredited: number;
    requiredPrepaymentAmount: number;
  } | null> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) return null;
    const { summary, resolved } = await this.outcomeForBooking(booking);
    return {
      screen: resolved.screen,
      reviewRequired: resolved.reviewRequired,
      reviewReasonCode:
        resolved.reviewReasonCode === 'NONE' ? null : resolved.reviewReasonCode,
      netCredited: summary.netCredited,
      requiredPrepaymentAmount: Number(
        booking.requiredPrepaymentAmount.toString(),
      ),
    };
  }

  private async buildStatus(
    bookingId: string,
    request: { id: string; paymentCode: string; status: string },
  ): Promise<PaymentStatusDto> {
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
    });
    const { summary, resolved } = await this.outcomeForBooking(booking);
    const [clock] = await this.prisma.$queryRaw<{ now: Date }[]>`
      SELECT clock_timestamp() AS now`;
    return {
      id: request.id,
      paymentCode: request.paymentCode,
      status: request.status,
      paidAmount: summary.netCredited,
      remainingAmount: summary.balanceDue,
      netCredited: summary.netCredited,
      requiredPrepaymentAmount: Number(
        booking.requiredPrepaymentAmount.toString(),
      ),
      serverNow: clock.now.toISOString(),
      bookingStatus: String(booking.status),
      reviewRequired: resolved.reviewRequired,
      reviewReasonCode:
        resolved.reviewReasonCode === 'NONE' ? null : resolved.reviewReasonCode,
      screen: resolved.screen,
    };
  }

  private async outcomeForBooking(booking: {
    id: string;
    status: unknown;
    totalAmount: { toString(): string } | number;
    requiredPrepaymentAmount: { toString(): string } | number;
  }): Promise<{
    summary: ReturnType<typeof summarizeBookingMoney>;
    resolved: ReturnType<typeof resolvePaymentOutcome>;
  }> {
    const receipts = await this.prisma.paymentTransaction.findMany({
      where: {
        paymentRequest: { referenceId: booking.id },
        verificationStatus: 'VERIFIED',
      },
      select: { amount: true, allocationStatus: true, id: true },
    });
    const receiptIds = receipts.map((receipt) => receipt.id);
    const completedRefunds =
      receiptIds.length === 0
        ? []
        : await this.prisma.refundRequest.findMany({
            where: {
              paymentTransactionId: { in: receiptIds },
              status: 'COMPLETED',
            },
            select: { amount: true },
          });
    const allocated = receipts
      .filter((receipt) => String(receipt.allocationStatus) === 'ALLOCATED')
      .map((receipt) => Number(receipt.amount.toString()));
    const summary = summarizeBookingMoney({
      totalAmount: Number(booking.totalAmount.toString()),
      allocatedReceiptAmounts: allocated,
      completedRefundAmounts: completedRefunds.map((refund) =>
        Number(refund.amount.toString()),
      ),
    });
    const facts: OutcomeFacts = {
      bookingStatus: String(booking.status),
      requiredPrepaymentAmount: Number(
        booking.requiredPrepaymentAmount.toString(),
      ),
      netCredited: summary.netCredited,
      hasRefundRequiredReceipt: receipts.some(
        (receipt) => String(receipt.allocationStatus) === 'REFUND_REQUIRED',
      ),
      hasUnknownOrFailedRefundAttempt: false,
      hasFailedRefund: false,
      needsRefundDestination: false,
    };
    const unknownFailed = await this.prisma.refundAttempt.count({
      where: {
        refundRequest: {
          paymentTransaction: { paymentRequest: { referenceId: booking.id } },
        },
        status: { in: ['UNKNOWN', 'FAILED'] },
      },
    });
    facts.hasUnknownOrFailedRefundAttempt = unknownFailed > 0;
    return { summary, resolved: resolvePaymentOutcome(facts) };
  }
}
