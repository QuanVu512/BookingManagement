import { MINUTE_MS } from '../../bookings/booking.constants.js';
import { normalizeGuestEmail } from './guest-checkout-fingerprint.js';

/**
 * Contract F6 — giới hạn fan-out tra cứu theo SĐT.
 * Một SĐT có thể gắn nhiều đơn/email; server chỉ gửi link tới email của
 * từng đơn còn hạn, có quota theo SĐT/recipient và luôn trả thông báo
 * generic. Không trả danh sách đơn/email ra màn hình tra cứu.
 */
export const LOOKUP_FANOUT_MAX_RECIPIENTS = 5;
export const LOOKUP_PHONE_MAX_EMAILS_PER_WINDOW = 8;
export const LOOKUP_RECIPIENT_MAX_EMAILS_PER_WINDOW = 1;
export const LOOKUP_PHONE_WINDOW_MS = 15 * MINUTE_MS;
export const LOOKUP_RECIPIENT_WINDOW_MS = 60 * MINUTE_MS;

export const GUEST_LOOKUP_GENERIC_MESSAGE =
  'Nếu thông tin khớp với một đơn đang giữ chỗ, hệ thống đã gửi liên kết khôi phục tới email của chủ đơn. Vui lòng kiểm tra hộp thư.';

export interface GuestLookupMatch {
  email: string;
  bookingId: string;
  bookingStatus: string;
  holdExpiresAt: Date;
}

export interface GuestLookupFanoutInput {
  serverNow: Date;
  matches: readonly GuestLookupMatch[];
  phoneEmailsSentInWindow: number;
  recipientEmailsSentInWindow?: ReadonlyMap<string, number>;
}

export interface GuestLookupFanoutSkipped {
  notActive: number;
  duplicateRecipient: number;
  phoneQuota: number;
  recipientQuota: number;
  fanoutCap: number;
}

/**
 * Nhóm nội bộ email -> các booking còn hạn. Chỉ dùng để dựng nội dung email;
 * không được trả ra response public (AC-22).
 */
export interface GuestLookupRecipientGroup {
  email: string;
  bookingIds: string[];
}

export interface GuestLookupFanoutPlan {
  recipients: GuestLookupRecipientGroup[];
  skipped: GuestLookupFanoutSkipped;
}

function isLiveHold(match: GuestLookupMatch, nowMs: number): boolean {
  return (
    match.bookingStatus === 'HOLDING' && match.holdExpiresAt.getTime() > nowMs
  );
}

function emptySkipped(): GuestLookupFanoutSkipped {
  return {
    notActive: 0,
    duplicateRecipient: 0,
    phoneQuota: 0,
    recipientQuota: 0,
    fanoutCap: 0,
  };
}

function collectRecipientGroups(
  input: GuestLookupFanoutInput,
  skipped: GuestLookupFanoutSkipped,
): GuestLookupRecipientGroup[] {
  const nowMs = input.serverNow.getTime();
  const groups = new Map<string, Set<string>>();
  for (const match of input.matches) {
    if (!isLiveHold(match, nowMs)) {
      skipped.notActive += 1;
      continue;
    }
    const email = normalizeGuestEmail(match.email);
    const bookingId = match.bookingId.trim();
    if (bookingId.length === 0) {
      throw new RangeError('bookingId không được rỗng.');
    }
    const bookings = groups.get(email);
    if (bookings?.has(bookingId)) {
      skipped.duplicateRecipient += 1;
      continue;
    }
    if (bookings) {
      bookings.add(bookingId);
    } else {
      groups.set(email, new Set([bookingId]));
    }
  }
  return [...groups.entries()]
    .map(([email, bookingIds]) => ({
      email,
      bookingIds: [...bookingIds].sort((left, right) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
    }))
    .sort((left, right) =>
      left.email < right.email ? -1 : left.email > right.email ? 1 : 0,
    );
}

function hasRecipientQuota(
  email: string,
  input: GuestLookupFanoutInput,
): boolean {
  const sent = input.recipientEmailsSentInWindow?.get(email) ?? 0;
  return sent < LOOKUP_RECIPIENT_MAX_EMAILS_PER_WINDOW;
}

function applyQuotas(
  candidates: readonly GuestLookupRecipientGroup[],
  input: GuestLookupFanoutInput,
  skipped: GuestLookupFanoutSkipped,
): GuestLookupRecipientGroup[] {
  const phoneAllowance = Math.max(
    0,
    LOOKUP_PHONE_MAX_EMAILS_PER_WINDOW - input.phoneEmailsSentInWindow,
  );
  const isPhoneQuotaLimiting = phoneAllowance <= LOOKUP_FANOUT_MAX_RECIPIENTS;
  const allowance = isPhoneQuotaLimiting
    ? phoneAllowance
    : LOOKUP_FANOUT_MAX_RECIPIENTS;
  const recipients: GuestLookupRecipientGroup[] = [];
  for (const group of candidates) {
    if (recipients.length >= allowance) {
      skipped[isPhoneQuotaLimiting ? 'phoneQuota' : 'fanoutCap'] += 1;
      continue;
    }
    if (!hasRecipientQuota(group.email, input)) {
      skipped.recipientQuota += 1;
      continue;
    }
    recipients.push(group);
  }
  return recipients;
}

export function planGuestLookupFanout(
  input: GuestLookupFanoutInput,
): GuestLookupFanoutPlan {
  if (input.phoneEmailsSentInWindow < 0) {
    throw new RangeError('phoneEmailsSentInWindow không được âm.');
  }
  const skipped = emptySkipped();
  const candidates = collectRecipientGroups(input, skipped);
  return {
    recipients: applyQuotas(candidates, input, skipped),
    skipped,
  };
}

/**
 * Luôn trả cùng một thông báo, không tiết lộ có/không có đơn khớp hoặc
 * danh tính người nhận (AC-22).
 */
export function buildGuestLookupPublicResponse(): {
  success: true;
  message: string;
} {
  return { success: true, message: GUEST_LOOKUP_GENERIC_MESSAGE };
}
