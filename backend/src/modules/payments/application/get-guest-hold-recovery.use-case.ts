import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import {
  resolveCheckoutTokenCapabilities,
  type CheckoutRecoveryCapabilities,
} from '../domain/guest-checkout-token-policy.js';
import {
  resolveGuestHoldActions,
  type GuestHoldBookingStatus,
  type GuestPaymentRequestStatus,
} from '../domain/guest-hold-actions.js';
import { PaymentOutcomeService } from './payment-outcome.service.js';

export type GuestRecoveryScreen =
  | 'SCR_PENDING'
  | 'SCR04_SUCCESS'
  | 'SCR06_REVIEW'
  | 'SCR_CANCELLED'
  | 'SCR05_EXPIRED';

export interface GuestHoldRecoveryResponse {
  booking: {
    id: string;
    code: string;
    courtId: string;
    courtName: string;
    courtCode: string;
    startsAt: string;
    endsAt: string;
    totalAmount: number;
    prepaymentAmount: number;
    status: GuestHoldBookingStatus;
    holdExpiresAt: string;
  };
  serverClock: {
    serverNow: string;
    remainingHoldSeconds: number;
    isHoldExpired: boolean;
  };
  payment: {
    requestId: string;
    provider: 'PAYOS' | 'VIETQR';
    status: GuestPaymentRequestStatus;
    amount: number;
    vietQrPayload?: string;
    checkoutUrl?: string;
    outcomeScreen: GuestRecoveryScreen;
    requiresReview: boolean;
  } | null;
  allowedActions: {
    canReadRecovery: boolean;
    canPay: boolean;
    canShowQr: boolean;
    canCreatePayment: boolean;
    canCancelHold: boolean;
    requiresReview: boolean;
    isHoldExpired: boolean;
  };
}

/**
 * Task 3.2 (làm sớm ở Bước 2) — GET /recovery: snapshot server-authoritative.
 * Không suy trạng thái từ client; mọi số tiền/status lấy DB + resolver chung.
 * Hold quá hạn nhưng token còn hạn (AC-15) chỉ đọc, mutation bị khóa.
 */
@Injectable()
export class GetGuestHoldRecoveryUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outcomes: PaymentOutcomeService,
  ) {}

  async execute(bookingId: string): Promise<GuestHoldRecoveryResponse> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        court: { select: { id: true, code: true, name: true } },
      },
    });
    if (!booking || booking.userId !== null) {
      throw new NotFoundException({
        code: 'BOOKING_NOT_FOUND',
        message: 'Không tìm thấy đơn giữ chỗ.',
      });
    }

    const [clock] = await this.prisma.$queryRaw<{ now: Date }[]>`
      SELECT clock_timestamp() AS now`;
    const serverNow = clock.now;
    const holdExpiresAt = booking.holdExpiresAt;
    const isHoldExpired = serverNow.getTime() >= holdExpiresAt.getTime();

    const capabilities = this.capabilitiesOf(
      booking.createdAt,
      holdExpiresAt,
      serverNow,
    );
    const outcome = await this.outcomes.bookingOutcome(booking.id);

    const request = await this.prisma.paymentRequest.findFirst({
      where: { referenceId: booking.id, purpose: 'PREPAYMENT' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        provider: true,
        status: true,
        amount: true,
        vietQrPayload: true,
        checkoutUrl: true,
      },
    });
    const paymentFacts = request
      ? {
          status: String(request.status) as GuestPaymentRequestStatus,
          hasQrPayload: Boolean(request.vietQrPayload),
          requiresReview: outcome?.reviewRequired ?? false,
        }
      : null;

    const projectedStatus: GuestHoldBookingStatus =
      booking.status === 'HOLDING' && isHoldExpired
        ? 'EXPIRED'
        : (String(booking.status) as GuestHoldBookingStatus);

    const actions = resolveGuestHoldActions({
      bookingStatus: projectedStatus,
      serverNow,
      holdExpiresAt,
      payment: paymentFacts,
      capabilities,
    });

    const screen =
      (outcome?.screen as GuestRecoveryScreen | undefined) ??
      (isHoldExpired ? 'SCR05_EXPIRED' : 'SCR_PENDING');

    return {
      booking: {
        id: booking.id,
        code: booking.bookingCode,
        courtId: booking.courtId,
        courtName: booking.court.name,
        courtCode: booking.court.code,
        startsAt: booking.startsAt.toISOString(),
        endsAt: booking.endsAt.toISOString(),
        totalAmount: Number(booking.totalAmount.toString()),
        prepaymentAmount: Number(booking.requiredPrepaymentAmount.toString()),
        status: projectedStatus,
        holdExpiresAt: holdExpiresAt.toISOString(),
      },
      serverClock: {
        serverNow: serverNow.toISOString(),
        remainingHoldSeconds: Math.max(
          0,
          Math.floor((holdExpiresAt.getTime() - serverNow.getTime()) / 1000),
        ),
        isHoldExpired,
      },
      payment: request
        ? {
            requestId: request.id,
            provider: (request.provider ?? '').toUpperCase().includes('VIETQR')
              ? 'VIETQR'
              : 'PAYOS',
            status: String(request.status) as GuestPaymentRequestStatus,
            amount: Number(request.amount.toString()),
            vietQrPayload: request.vietQrPayload ?? undefined,
            checkoutUrl: request.checkoutUrl ?? undefined,
            outcomeScreen: screen,
            requiresReview: outcome?.reviewRequired ?? false,
          }
        : null,
      allowedActions: {
        canReadRecovery: actions.canReadRecovery,
        canPay: actions.canPay,
        canShowQr: actions.canShowQr,
        canCreatePayment: actions.canCreatePayment,
        canCancelHold: actions.canCancelHold,
        requiresReview: actions.requiresReview,
        isHoldExpired,
      },
    };
  }

  private capabilitiesOf(
    holdIssuedAt: Date,
    holdExpiresAt: Date,
    serverNow: Date,
  ): CheckoutRecoveryCapabilities {
    return resolveCheckoutTokenCapabilities({
      holdIssuedAt,
      holdExpiresAt,
      serverNow,
    });
  }
}
