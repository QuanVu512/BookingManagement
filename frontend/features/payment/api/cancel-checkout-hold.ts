import { API_BASE_URL, AUTH_REQUEST_TIMEOUT_MS } from '../../../constants/network';
import { cancelBooking } from '../../booking/api/booking-service';
import { readGuestCheckoutIdentityByBooking } from './guest-checkout-identity';

export function saveGuestCheckoutToken(bookingId: string, token: string) {
  if (!token) return;
  try {
    sessionStorage.setItem(`guest-checkout-token:${bookingId}`, token);
  } catch { /* Storage can be unavailable in private tabs. */ }
}

export async function cancelCheckoutHold(bookingId: string, type: 'guest' | 'member') {
  if (type === 'member') return cancelBooking(bookingId);
  const signal = AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS);
  let token: string | null = null;
  try { token = sessionStorage.getItem(`guest-checkout-token:${bookingId}`); } catch {}
  // Holds created before token persistence was added can recover in the same tab.
  if (!token) {
    const identity = readGuestCheckoutIdentityByBooking(bookingId);
    if (!identity) throw new Error('Không có quyền hủy đơn trong tab này. Hãy mở lại đơn từ tab đã đặt sân.');
    const resumed = await post('resume-intent', {
      checkoutIntentId: identity.checkoutIntentId,
      recoverySecret: identity.recoverySecret,
    }, signal);
    if (resumed.bookingId !== bookingId || typeof resumed.checkoutToken !== 'string')
      throw new Error('Không xác nhận được quyền hủy đơn. Vui lòng tải lại.');
    token = resumed.checkoutToken;
    saveGuestCheckoutToken(bookingId, token);
  }
  const result = await post(`${encodeURIComponent(bookingId)}/cancel-hold`, undefined, signal, token);
  if (result.bookingId !== bookingId || !['CANCELLED', 'EXPIRED'].includes(String(result.status)))
    throw new Error('Máy chủ chưa xác nhận hủy đơn. Vui lòng tải lại.');
  return result;
}

async function post(path: string, body: unknown, signal: AbortSignal, token?: string) {
  const response = await fetch(`${API_BASE_URL}/api/guest/bookings/${path}`, {
    method: 'POST', credentials: 'omit', cache: 'no-store', signal,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Booking-Checkout-Token': token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json();
  if (!response.ok || payload?.success !== true || !payload.data)
    throw new Error(typeof payload?.message === 'string' ? payload.message : 'Chưa hủy được đơn. Vui lòng thử lại.');
  return payload.data as Record<string, unknown>;
}
