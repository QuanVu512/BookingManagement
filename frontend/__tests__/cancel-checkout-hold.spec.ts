import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { cancelCheckoutHold, saveGuestCheckoutToken } from '../features/payment/api/cancel-checkout-hold.js';
import { saveGuestCheckoutIdentity } from '../features/payment/api/guest-checkout-identity.js';
const originalFetch = globalThis.fetch;
const storage = new Map<string, string>();
const fetchMock = jest.fn<typeof fetch>();
beforeEach(() => {
  storage.clear(); fetchMock.mockReset(); globalThis.fetch = fetchMock;
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  }});
});
afterEach(() => { globalThis.fetch = originalFetch; Reflect.deleteProperty(globalThis, 'sessionStorage'); });
const response = (data: unknown, status = 200) => new Response(JSON.stringify({ success: status === 200, data }), { status });
it('Hủy giữ chỗ trên máy chủ bằng mã checkoutToken, không gửi kèm cookie tài khoản', async () => {
  saveGuestCheckoutToken('hold-1', 'checkout-1');
  fetchMock.mockResolvedValue(response({ bookingId: 'hold-1', status: 'CANCELLED' }));
  await expect(cancelCheckoutHold('hold-1', 'guest')).resolves.toMatchObject({ status: 'CANCELLED' });
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/guest/bookings/hold-1/cancel-hold'), expect.objectContaining({
    method: 'POST', credentials: 'omit', headers: expect.objectContaining({ 'X-Booking-Checkout-Token': 'checkout-1' }),
  }));
});
it('Tự động khôi phục mã checkoutToken cho các đơn giữ chỗ tạo trước bản sửa lỗi', async () => {
  saveGuestCheckoutIdentity({ checkoutIntentId: 'intent-1', recoverySecret: 'secret-1', bookingId: 'hold-1' });
  fetchMock.mockResolvedValueOnce(response({ bookingId: 'hold-1', checkoutToken: 'recovered' }))
    .mockResolvedValueOnce(response({ bookingId: 'hold-1', status: 'EXPIRED' }));
  await expect(cancelCheckoutHold('hold-1', 'guest')).resolves.toMatchObject({ status: 'EXPIRED' });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it('Báo lỗi khi máy chủ từ chối hủy hoặc hủy chưa thành công, không báo thành công giả', async () => {
  saveGuestCheckoutToken('hold-1', 'checkout-1');
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Already paid' }), { status: 409 }));
  await expect(cancelCheckoutHold('hold-1', 'guest')).rejects.toThrow('Already paid');
  fetchMock.mockResolvedValueOnce(response({ bookingId: 'hold-1', status: 'HOLDING' }));
  await expect(cancelCheckoutHold('hold-1', 'guest')).rejects.toThrow();
});
