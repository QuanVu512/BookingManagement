/**
 * P2-3 — accessToken của guest chỉ được trả một lần khi tạo hold.
 * Replay/intent resume trả `accessToken: ''`; ghi đè bằng chuỗi rỗng sẽ làm
 * mất token đã lưu và khách không mở được trang quản lý đơn.
 */

const TOKEN_STORAGE_KEY = 'guest-manage-token';

export interface GuestAccessTokenState {
  bookingId: string;
  accessToken?: string;
}

/** Chỉ ghi token non-empty; token cũ (nếu có) được giữ nguyên. */
export function saveGuestManageToken(
  bookingId: string,
  accessToken: string,
): void {
  if (typeof accessToken !== 'string' || accessToken.length === 0) return;
  try {
    sessionStorage.setItem(`${TOKEN_STORAGE_KEY}:${bookingId}`, accessToken);
  } catch {
    // Tab riêng tư hoặc không hỗ trợ sessionStorage.
  }
}

/**
 * Khi replay trả token rỗng, chỉ kế thừa token pending cũ nếu cùng booking;
 * booking khác thì không mang token của đơn trước sang.
 */
export function resolvePendingGuestAccessToken(
  previous: GuestAccessTokenState | null,
  next: GuestAccessTokenState,
): string | undefined {
  if (typeof next.accessToken === 'string' && next.accessToken.length > 0) {
    return next.accessToken;
  }
  return previous?.bookingId === next.bookingId
    ? previous.accessToken
    : undefined;
}
