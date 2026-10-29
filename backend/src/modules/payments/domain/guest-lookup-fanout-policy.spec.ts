import { describe, expect, it } from '@jest/globals';
import {
  GUEST_LOOKUP_GENERIC_MESSAGE,
  LOOKUP_FANOUT_MAX_RECIPIENTS,
  buildGuestLookupPublicResponse,
  planGuestLookupFanout,
  type GuestLookupMatch,
} from './guest-lookup-fanout-policy.js';

const NOW = new Date('2026-10-29T03:02:00.000Z');
const LIVE_EXPIRY = new Date('2026-10-29T03:05:00.000Z');
const DEAD_EXPIRY = new Date('2026-10-29T03:01:00.000Z');

function match(email: string, overrides: Partial<GuestLookupMatch> = {}) {
  return {
    email,
    bookingId: 'bk-1',
    bookingStatus: 'HOLDING',
    holdExpiresAt: LIVE_EXPIRY,
    ...overrides,
  };
}

function recipientEmails(plan: ReturnType<typeof planGuestLookupFanout>) {
  return plan.recipients.map((recipient) => recipient.email);
}

describe('guest lookup fan-out policy (F6)', () => {
  it('deduplicates recipients and caps the number of emails', () => {
    const emails = [
      'a@example.com',
      'b@example.com',
      'c@example.com',
      'd@example.com',
      'e@example.com',
      'f@example.com',
      'g@example.com',
    ];
    const plan = planGuestLookupFanout({
      serverNow: NOW,
      matches: emails.map((email, index) =>
        match(email, { bookingId: `bk-${index}` }),
      ),
      phoneEmailsSentInWindow: 0,
    });
    expect(plan.recipients).toHaveLength(LOOKUP_FANOUT_MAX_RECIPIENTS);
    expect(recipientEmails(plan)).toEqual(
      emails.slice(0, LOOKUP_FANOUT_MAX_RECIPIENTS),
    );
    expect(plan.recipients[0].bookingIds).toEqual(['bk-0']);
    expect(plan.skipped.fanoutCap).toBe(2);

    const duplicatePlan = planGuestLookupFanout({
      serverNow: NOW,
      matches: [match('A@Example.com'), match('a@example.com')],
      phoneEmailsSentInWindow: 0,
    });
    expect(duplicatePlan.recipients).toEqual([
      { email: 'a@example.com', bookingIds: ['bk-1'] },
    ]);
    expect(duplicatePlan.skipped.duplicateRecipient).toBe(1);
  });

  it('keeps every live booking for an email in one recipient group', () => {
    const plan = planGuestLookupFanout({
      serverNow: NOW,
      matches: [
        match('  User@Test.com ', { bookingId: 'bk-2' }),
        match('user@test.com', { bookingId: 'bk-1' }),
        match('other@test.com', { bookingId: 'bk-3' }),
      ],
      phoneEmailsSentInWindow: 0,
    });
    expect(plan.recipients).toEqual([
      { email: 'other@test.com', bookingIds: ['bk-3'] },
      { email: 'user@test.com', bookingIds: ['bk-1', 'bk-2'] },
    ]);
    expect(plan.skipped.duplicateRecipient).toBe(0);
  });

  it('does not lose the live booking when the same email has an expired hold', () => {
    const plan = planGuestLookupFanout({
      serverNow: NOW,
      matches: [
        match('user@test.com', {
          bookingId: 'bk-old',
          holdExpiresAt: DEAD_EXPIRY,
        }),
        match('user@test.com', { bookingId: 'bk-live' }),
      ],
      phoneEmailsSentInWindow: 0,
    });
    expect(plan.recipients).toEqual([
      { email: 'user@test.com', bookingIds: ['bk-live'] },
    ]);
    expect(plan.skipped.notActive).toBe(1);
  });

  it('sends nothing for expired or non-holding bookings', () => {
    const plan = planGuestLookupFanout({
      serverNow: NOW,
      matches: [
        match('expired@example.com', { holdExpiresAt: DEAD_EXPIRY }),
        match('cancelled@example.com', { bookingStatus: 'CANCELLED' }),
        match('confirmed@example.com', { bookingStatus: 'CONFIRMED' }),
      ],
      phoneEmailsSentInWindow: 0,
    });
    expect(plan.recipients).toEqual([]);
    expect(plan.skipped.notActive).toBe(3);
  });

  it('respects the phone quota before the hard fan-out cap', () => {
    const plan = planGuestLookupFanout({
      serverNow: NOW,
      matches: ['a', 'b', 'c', 'd', 'e'].map((prefix, index) =>
        match(`${prefix}@example.com`, { bookingId: `bk-${index}` }),
      ),
      phoneEmailsSentInWindow: 6,
    });
    expect(plan.recipients).toHaveLength(2);
    expect(plan.skipped.phoneQuota).toBe(3);
  });

  it('skips recipients that already received a link in the window', () => {
    const plan = planGuestLookupFanout({
      serverNow: NOW,
      matches: [
        match('blocked@example.com'),
        match('allowed@example.com', { bookingId: 'bk-2' }),
      ],
      phoneEmailsSentInWindow: 0,
      recipientEmailsSentInWindow: new Map([['blocked@example.com', 1]]),
    });
    expect(recipientEmails(plan)).toEqual(['allowed@example.com']);
    expect(plan.skipped.recipientQuota).toBe(1);
  });

  it('never discloses match count or recipient identities', () => {
    expect(buildGuestLookupPublicResponse()).toEqual({
      success: true,
      message: GUEST_LOOKUP_GENERIC_MESSAGE,
    });
    expect(buildGuestLookupPublicResponse()).toEqual(
      buildGuestLookupPublicResponse(),
    );
  });
});
