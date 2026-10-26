/**
 * C10/C11 — Điều kiện check-in và hoàn tất (domain thuần, không Nest/Prisma).
 * - Chỉ CONFIRMED + đủ net (I10) + chưa check-in + còn hiệu lực slot.
 * - Cửa sổ thời gian (D02) do caller cung cấp tường minh; window null hoặc
 *   thiếu cấu hình → từ chối fail-closed, KHÔNG đoán mặc định.
 * - Kết thúc slot (decidedAt >= endsAt) → TOO_LATE: slot là fact booking,
 *   không phải policy suy đoán.
 */
export interface CheckinWindow {
  minutesBeforeStart: number;
  minutesAfterStart: number;
}

export type CheckinBlockCode =
  | 'WINDOW_UNCONFIGURED'
  | 'NOT_CONFIRMED'
  | 'TERMINAL'
  | 'ALREADY_CHECKED_IN'
  | 'INSUFFICIENT_BALANCE'
  | 'TOO_EARLY'
  | 'TOO_LATE';

export type CheckinEligibility =
  | { eligible: true }
  | { eligible: false; code: CheckinBlockCode };

const TERMINAL_STATUSES = new Set([
  'EXPIRED',
  'CANCELLED',
  'COMPLETED',
  'NO_SHOW',
]);

export function checkinEligibility(input: {
  status: string;
  netCredited: number;
  totalAmount: number;
  hasCheckin: boolean;
  nowMs: number;
  startsAtMs: number;
  endsAtMs: number;
  window: CheckinWindow | null;
}): CheckinEligibility {
  if (input.hasCheckin || input.status === 'CHECKED_IN') {
    return { eligible: false, code: 'ALREADY_CHECKED_IN' };
  }
  if (TERMINAL_STATUSES.has(input.status)) {
    return { eligible: false, code: 'TERMINAL' };
  }
  if (input.status !== 'CONFIRMED') {
    return { eligible: false, code: 'NOT_CONFIRMED' };
  }
  if (
    !Number.isSafeInteger(input.netCredited) ||
    !Number.isSafeInteger(input.totalAmount) ||
    input.netCredited < input.totalAmount
  ) {
    return { eligible: false, code: 'INSUFFICIENT_BALANCE' };
  }
  const window = input.window;
  if (
    !window ||
    !Number.isSafeInteger(window.minutesBeforeStart) ||
    !Number.isSafeInteger(window.minutesAfterStart) ||
    window.minutesBeforeStart < 0 ||
    window.minutesAfterStart < 0
  ) {
    return { eligible: false, code: 'WINDOW_UNCONFIGURED' };
  }
  if (input.nowMs < input.startsAtMs - window.minutesBeforeStart * 60_000) {
    return { eligible: false, code: 'TOO_EARLY' };
  }
  if (
    input.nowMs > input.startsAtMs + window.minutesAfterStart * 60_000 ||
    input.nowMs >= input.endsAtMs
  ) {
    return { eligible: false, code: 'TOO_LATE' };
  }
  return { eligible: true };
}

/**
 * D02 (APPROVED 2026-10-24) — Cửa sổ check-in: mở đúng startsAt, cho phép
 * đến trước endsAt; đến muộn không dãn endsAt. Đây là default kỹ thuật đã
 * duyệt: thiếu cấu hình → dùng giá trị duyệt (before 0; after đủ lớn để
 * endsAt — fact slot — làm chặn trên thực tế). Chỉ config tường minh mà
 * không hợp lệ mới fail-closed null.
 */
export const APPROVED_CHECKIN_WINDOW: CheckinWindow = {
  minutesBeforeStart: 0,
  minutesAfterStart: 24 * 60,
};

function isValidWindow(value: {
  minutesBeforeStart: number;
  minutesAfterStart: number;
}): boolean {
  return (
    Number.isSafeInteger(value.minutesBeforeStart) &&
    Number.isSafeInteger(value.minutesAfterStart) &&
    value.minutesBeforeStart >= 0 &&
    value.minutesAfterStart >= 0 &&
    value.minutesBeforeStart <= 24 * 60 &&
    value.minutesAfterStart <= 24 * 60
  );
}

/**
 * Đọc cửa sổ check-in từ cấu hình triển khai. Thiếu cấu hình → giá trị
 * đã duyệt D02; giá trị tường minh không hợp lệ → null (fail-closed).
 */
export function readCheckinWindow(
  get: (name: string) => string | undefined,
): CheckinWindow | null {
  const beforeRaw = get('CHECKIN_WINDOW_MINUTES_BEFORE_START');
  const afterRaw = get('CHECKIN_WINDOW_MINUTES_AFTER_START');
  if (beforeRaw === undefined && afterRaw === undefined) {
    return { ...APPROVED_CHECKIN_WINDOW };
  }
  const window = {
    minutesBeforeStart: Number(beforeRaw),
    minutesAfterStart: Number(afterRaw),
  };
  return isValidWindow(window) ? window : null;
}
