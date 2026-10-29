import { MINUTE_MS } from '../../bookings/booking.constants.js';

/**
 * Contract F2 — CheckoutRecoveryToken sống cố định 10 phút từ hold gốc.
 * Mutation chỉ mở trong cửa sổ hold (serverNow < holdExpiresAt); sau đó chỉ
 * còn quyền đọc terminal summary. Không nhận TTL từ request/CLI để tránh
 * gia hạn khi replay.
 */
export const CHECKOUT_RECOVERY_TOKEN_TTL_MINUTES = 10;
export const CHECKOUT_RECOVERY_TOKEN_TTL_MS =
  CHECKOUT_RECOVERY_TOKEN_TTL_MINUTES * MINUTE_MS;

export const CHECKOUT_RECOVERY_OPERATIONS = [
  'READ_HOLD_RECOVERY',
  'CREATE_PREPAYMENT',
  'CANCEL_HOLD',
  'REQUEST_PAID_CANCEL',
  'VIEW_REFUND',
] as const;

export type CheckoutRecoveryOperation =
  (typeof CHECKOUT_RECOVERY_OPERATIONS)[number];

export interface CheckoutRecoveryWindowFacts {
  holdIssuedAt: Date;
  holdExpiresAt: Date;
  serverNow: Date;
}

export interface CheckoutRecoveryCapabilities {
  tokenExpiresAt: Date;
  remainingTokenMs: number;
  canReadTerminalSummary: boolean;
  canMutateHold: boolean;
}

function assertValidInstant(name: string, value: Date): void {
  if (!Number.isFinite(value.getTime())) {
    throw new RangeError(`${name} phải là thời điểm hợp lệ.`);
  }
}

export function assertValidCheckoutWindow(
  facts: CheckoutRecoveryWindowFacts,
): void {
  assertValidInstant('holdIssuedAt', facts.holdIssuedAt);
  assertValidInstant('holdExpiresAt', facts.holdExpiresAt);
  assertValidInstant('serverNow', facts.serverNow);
  if (facts.holdExpiresAt.getTime() <= facts.holdIssuedAt.getTime()) {
    throw new RangeError('holdExpiresAt phải sau holdIssuedAt.');
  }
}

export function resolveCheckoutTokenCapabilities(
  facts: CheckoutRecoveryWindowFacts,
): CheckoutRecoveryCapabilities {
  assertValidCheckoutWindow(facts);
  const tokenExpiresAt = new Date(
    facts.holdIssuedAt.getTime() + CHECKOUT_RECOVERY_TOKEN_TTL_MS,
  );
  const nowMs = facts.serverNow.getTime();
  const tokenLive = nowMs < tokenExpiresAt.getTime();
  const holdLive = nowMs < facts.holdExpiresAt.getTime();
  return {
    tokenExpiresAt,
    remainingTokenMs: Math.max(0, tokenExpiresAt.getTime() - nowMs),
    canReadTerminalSummary: tokenLive,
    canMutateHold: tokenLive && holdLive,
  };
}

export function isCheckoutOperationAllowed(
  capabilities: CheckoutRecoveryCapabilities,
  operation: CheckoutRecoveryOperation,
): boolean {
  switch (operation) {
    case 'READ_HOLD_RECOVERY':
      return capabilities.canReadTerminalSummary;
    case 'CREATE_PREPAYMENT':
    case 'CANCEL_HOLD':
      return capabilities.canMutateHold;
    case 'REQUEST_PAID_CANCEL':
    case 'VIEW_REFUND':
      // Chỉ ManageToken dài hạn mới có quyền này (AC-18).
      return false;
  }
}
