import { describe, expect, it } from '@jest/globals';
import {
  CHECKOUT_RECOVERY_TOKEN_TTL_MS,
  assertValidCheckoutWindow,
  isCheckoutOperationAllowed,
  resolveCheckoutTokenCapabilities,
} from './guest-checkout-token-policy.js';

const HOLD_ISSUED_AT = new Date('2026-10-29T03:00:00.000Z');
const HOLD_EXPIRES_AT = new Date(HOLD_ISSUED_AT.getTime() + 5 * 60_000);

function capabilitiesAt(offsetMs: number) {
  return resolveCheckoutTokenCapabilities({
    holdIssuedAt: HOLD_ISSUED_AT,
    holdExpiresAt: HOLD_EXPIRES_AT,
    serverNow: new Date(HOLD_ISSUED_AT.getTime() + offsetMs),
  });
}

describe('checkout recovery token capability matrix', () => {
  it('fixes token lifetime at 10 minutes from the original hold', () => {
    expect(CHECKOUT_RECOVERY_TOKEN_TTL_MS).toBe(10 * 60_000);
    expect(capabilitiesAt(0).tokenExpiresAt.toISOString()).toBe(
      '2026-10-29T03:10:00.000Z',
    );
    expect(capabilitiesAt(9 * 60_000).tokenExpiresAt.toISOString()).toBe(
      '2026-10-29T03:10:00.000Z',
    );
  });

  it('allows mutation only inside the hold window', () => {
    const start = capabilitiesAt(0);
    expect(start.canReadTerminalSummary).toBe(true);
    expect(start.canMutateHold).toBe(true);
    expect(capabilitiesAt(4 * 60_000 + 59_999).canMutateHold).toBe(true);
    expect(capabilitiesAt(5 * 60_000).canMutateHold).toBe(false);
  });

  it('keeps terminal-summary read until minute 10 then expires', () => {
    const readOnly = capabilitiesAt(7 * 60_000);
    expect(readOnly.canReadTerminalSummary).toBe(true);
    expect(readOnly.canMutateHold).toBe(false);
    expect(capabilitiesAt(9 * 60_000 + 59_999).canReadTerminalSummary).toBe(
      true,
    );
    expect(capabilitiesAt(10 * 60_000).canReadTerminalSummary).toBe(false);
    expect(capabilitiesAt(10 * 60_000).remainingTokenMs).toBe(0);
  });

  it('never grants manage/refund capabilities to the checkout token', () => {
    const full = capabilitiesAt(0);
    expect(isCheckoutOperationAllowed(full, 'READ_HOLD_RECOVERY')).toBe(true);
    expect(isCheckoutOperationAllowed(full, 'CREATE_PREPAYMENT')).toBe(true);
    expect(isCheckoutOperationAllowed(full, 'CANCEL_HOLD')).toBe(true);
    expect(isCheckoutOperationAllowed(full, 'REQUEST_PAID_CANCEL')).toBe(false);
    expect(isCheckoutOperationAllowed(full, 'VIEW_REFUND')).toBe(false);
  });

  it('rejects malformed windows instead of inventing a longer lifetime', () => {
    expect(() =>
      assertValidCheckoutWindow({
        holdIssuedAt: HOLD_ISSUED_AT,
        holdExpiresAt: HOLD_ISSUED_AT,
        serverNow: HOLD_ISSUED_AT,
      }),
    ).toThrow(RangeError);
    expect(() =>
      assertValidCheckoutWindow({
        holdIssuedAt: new Date(Number.NaN),
        holdExpiresAt: HOLD_EXPIRES_AT,
        serverNow: HOLD_ISSUED_AT,
      }),
    ).toThrow(RangeError);
  });
});
