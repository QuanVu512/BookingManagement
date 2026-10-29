/**
 * Danh tính một lượt guest checkout: `checkoutIntentId` + `recoverySecret`.
 *
 * Backend bắt buộc hai giá trị này khi tạo hold để có thể replay đúng intent
 * (không tạo hold thứ hai) và khôi phục đơn khi mất response. Phải giữ nguyên
 * qua các lần verify/gửi lại OTP trong cùng một lượt, nên lưu theo tab bằng
 * sessionStorage; tab riêng tư vẫn dùng được identity trong state component.
 */

const INTENT_STORAGE_PREFIX = 'guest-checkout-intent:';
const INTENT_BOOKING_POINTER_PREFIX = 'guest-checkout-intent-booking:';

const UUID_BYTE_LENGTH = 16;
const RECOVERY_SECRET_BYTE_LENGTH = 32;
const UUID_VERSION_MASK = 0x0f;
const UUID_VERSION_4 = 0x40;
const UUID_VARIANT_MASK = 0x3f;
const UUID_VARIANT_RFC4122 = 0x80;

export interface GuestCheckoutIdentity {
  checkoutIntentId: string;
  recoverySecret: string;
  /** Chỉ có sau khi backend đã tạo hold thành công. */
  bookingId?: string;
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * UUID v4 dựng từ `crypto.getRandomValues` thay vì `crypto.randomUUID` để
 * vẫn chạy trên origin HTTP không phải secure context (LAN/dev).
 */
export function newCheckoutIntentId(): string {
  const bytes = new Uint8Array(UUID_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & UUID_VERSION_MASK) | UUID_VERSION_4;
  bytes[8] = (bytes[8] & UUID_VARIANT_MASK) | UUID_VARIANT_RFC4122;
  const hex = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

export function createGuestCheckoutIdentity(): GuestCheckoutIdentity {
  return {
    checkoutIntentId: newCheckoutIntentId(),
    recoverySecret: randomHex(RECOVERY_SECRET_BYTE_LENGTH),
  };
}

export function saveGuestCheckoutIdentity(
  identity: GuestCheckoutIdentity,
): void {
  try {
    sessionStorage.setItem(
      `${INTENT_STORAGE_PREFIX}${identity.checkoutIntentId}`,
      JSON.stringify(identity),
    );
    if (identity.bookingId) {
      sessionStorage.setItem(
        `${INTENT_BOOKING_POINTER_PREFIX}${identity.bookingId}`,
        identity.checkoutIntentId,
      );
    }
  } catch {
    // Tab riêng tư chặn storage: identity vẫn nằm trong ref của component.
  }
}

function isGuestCheckoutIdentity(
  value: unknown,
): value is GuestCheckoutIdentity {
  if (typeof value !== 'object' || value === null) return false;
  const hasIntentId = 'checkoutIntentId' in value;
  const hasSecret = 'recoverySecret' in value;
  if (!hasIntentId || !hasSecret) return false;
  if (
    typeof value.checkoutIntentId !== 'string' ||
    typeof value.recoverySecret !== 'string'
  ) {
    return false;
  }
  return !('bookingId' in value) || typeof value.bookingId === 'string';
}

function parseGuestCheckoutIdentity(raw: string): GuestCheckoutIdentity | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isGuestCheckoutIdentity(parsed) ? parsed : null;
}

/** Đọc lại identity của hold đã tạo, phục vụ resume/recovery cùng tab. */
export function readGuestCheckoutIdentityByBooking(
  bookingId: string,
): GuestCheckoutIdentity | null {
  try {
    const checkoutIntentId = sessionStorage.getItem(
      `${INTENT_BOOKING_POINTER_PREFIX}${bookingId}`,
    );
    if (!checkoutIntentId) return null;
    const raw = sessionStorage.getItem(
      `${INTENT_STORAGE_PREFIX}${checkoutIntentId}`,
    );
    if (!raw) return null;
    return parseGuestCheckoutIdentity(raw);
  } catch {
    // Storage bị chặn: coi như không có identity để caller tự xử lý.
    return null;
  }
}
