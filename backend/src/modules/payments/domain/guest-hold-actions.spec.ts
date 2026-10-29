import { describe, expect, it } from '@jest/globals';
import {
  type GuestHoldBookingStatus,
  type GuestPaymentFacts,
  resolveGuestHoldActions,
} from './guest-hold-actions.js';
import { resolveCheckoutTokenCapabilities } from './guest-checkout-token-policy.js';

const HOLD_ISSUED_AT = new Date('2026-10-29T03:00:00.000Z');
const HOLD_EXPIRES_AT = new Date(HOLD_ISSUED_AT.getTime() + 5 * 60_000);

function actions(input: {
  offsetMs?: number;
  bookingStatus?: GuestHoldBookingStatus;
  payment?: GuestPaymentFacts | null;
}) {
  const serverNow = new Date(
    HOLD_ISSUED_AT.getTime() + (input.offsetMs ?? 60_000),
  );
  return resolveGuestHoldActions({
    bookingStatus: input.bookingStatus ?? 'HOLDING',
    serverNow,
    holdExpiresAt: HOLD_EXPIRES_AT,
    payment: input.payment ?? null,
    capabilities: resolveCheckoutTokenCapabilities({
      holdIssuedAt: HOLD_ISSUED_AT,
      holdExpiresAt: HOLD_EXPIRES_AT,
      serverNow,
    }),
  });
}

const CREATING: GuestPaymentFacts = {
  status: 'CREATING',
  hasQrPayload: false,
  requiresReview: false,
};

describe('guest hold action matrix (F4)', () => {
  it('allows creating a payment request when none exists', () => {
    const result = actions({ payment: null });
    expect(result.canCreatePayment).toBe(true);
    expect(result.canShowQr).toBe(false);
    expect(result.canCancelHold).toBe(true);
    expect(result.canPay).toBe(true);
  });

  it('treats CREATING as retry/reconcile, not as a ready QR', () => {
    const result = actions({ payment: CREATING });
    expect(result.canCreatePayment).toBe(true);
    expect(result.canShowQr).toBe(false);
    expect(result.canPay).toBe(true);
  });

  it('does not claim payment is possible while PENDING has no payload', () => {
    const result = actions({
      payment: {
        status: 'PENDING',
        hasQrPayload: false,
        requiresReview: false,
      },
    });
    expect(result.canCreatePayment).toBe(false);
    expect(result.canShowQr).toBe(false);
    expect(result.canPay).toBe(false);
  });

  it('shows the QR only when PENDING has a provider payload', () => {
    const result = actions({
      payment: { status: 'PENDING', hasQrPayload: true, requiresReview: false },
    });
    expect(result.canCreatePayment).toBe(false);
    expect(result.canShowQr).toBe(true);
    expect(result.canPay).toBe(true);
  });

  it('keeps QR visible for partial payment but blocks cancel', () => {
    const result = actions({
      payment: {
        status: 'PARTIALLY_PAID',
        hasQrPayload: true,
        requiresReview: false,
      },
    });
    expect(result.canShowQr).toBe(true);
    expect(result.canCreatePayment).toBe(false);
    expect(result.canCancelHold).toBe(false);
  });

  it('allows retry only for a FAILED provider request', () => {
    const result = actions({
      payment: { status: 'FAILED', hasQrPayload: false, requiresReview: false },
    });
    expect(result.canCreatePayment).toBe(true);
    expect(result.canShowQr).toBe(false);
    expect(result.canPay).toBe(true);
  });

  it('hides and blocks everything once funds are PAID', () => {
    const result = actions({
      payment: { status: 'PAID', hasQrPayload: true, requiresReview: false },
    });
    expect(result.canCreatePayment).toBe(false);
    expect(result.canShowQr).toBe(false);
    expect(result.canCancelHold).toBe(false);
    expect(result.canPay).toBe(false);
  });

  it.each(['CANCELLED', 'EXPIRED'] as const)(
    'does not silently replace a %s provider request',
    (status) => {
      const result = actions({
        payment: { status, hasQrPayload: false, requiresReview: false },
      });
      expect(result.canCreatePayment).toBe(false);
      expect(result.canShowQr).toBe(false);
      expect(result.canPay).toBe(false);
    },
  );

  it('locks actions when the payment is queued for finance review', () => {
    const result = actions({
      payment: { status: 'PENDING', hasQrPayload: true, requiresReview: true },
    });
    expect(result.requiresReview).toBe(true);
    expect(result.canCreatePayment).toBe(false);
    expect(result.canShowQr).toBe(false);
    expect(result.canCancelHold).toBe(false);
  });

  it('after hold expiry keeps read but blocks QR and mutations', () => {
    const result = actions({
      offsetMs: 6 * 60_000,
      payment: { status: 'PENDING', hasQrPayload: true, requiresReview: false },
    });
    expect(result.isHoldExpired).toBe(true);
    expect(result.canReadRecovery).toBe(true);
    expect(result.canShowQr).toBe(false);
    expect(result.canCreatePayment).toBe(false);
    expect(result.canCancelHold).toBe(false);
  });

  it('after token expiry blocks even terminal read', () => {
    const result = actions({ offsetMs: 10 * 60_000 });
    expect(result.canReadRecovery).toBe(false);
    expect(result.canPay).toBe(false);
  });

  it('does not expose action controls for CONFIRMED bookings', () => {
    const result = actions({
      bookingStatus: 'CONFIRMED',
      payment: { status: 'PAID', hasQrPayload: true, requiresReview: false },
    });
    expect(result.canPay).toBe(false);
    expect(result.canCancelHold).toBe(false);
    expect(result.canReadRecovery).toBe(true);
  });
});
