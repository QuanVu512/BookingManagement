import { describe, expect, it, jest } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { GuestBookingForm } from '../features/payment/components/guest-booking-form.js';
import { GuestBookingModal } from '../features/payment/components/guest-booking-modal.js';
import { GuestOtpDialog } from '../features/payment/components/guest-otp-dialog.js';
import { BookingQrModal } from '../features/payment/components/booking-qr-modal.js';
import {
  PendingBookingAlert,
  type PendingBookingState,
} from '../features/booking/components/pending-booking-alert.js';
import {
  isSlotInPast,
  isWindowInPast,
  DEFAULT_BOOKING_TIMEZONE,
  assertBookableWindow,
} from '../features/booking/model/booking-time.js';
import { selectPreset } from '../features/booking/model/booking-presets.js';
import { BookingSchedulePicker } from '../features/booking/components/booking-schedule-picker.js';
import { calculateEstimatedPrices } from '../features/booking/components/booking-order-summary.js';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://127.0.0.1:4001',
});

(dom.window as any).requestIdleCallback =
  (dom.window as any).requestIdleCallback || ((cb: () => void) => setTimeout(() => cb(), 1));
(dom.window as any).cancelIdleCallback =
  (dom.window as any).cancelIdleCallback || ((id: any) => clearTimeout(id));

for (const [name, value] of Object.entries({
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  requestIdleCallback: (dom.window as any).requestIdleCallback,
  cancelIdleCallback: (dom.window as any).cancelIdleCallback,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true });
}

const { createRoot } = await import('react-dom/client');

describe('Guest Booking Redesign & OTP Flow', () => {
  it('GuestBookingForm renders with redesigned structure and validates inputs', () => {
    const container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    const root = createRoot(container);

    const onCreated = jest.fn();
    act(() => {
      root.render(<GuestBookingForm courtId="court-1" onCreated={onCreated} />);
    });

    expect(container.querySelector('.guest-booking-card')).not.toBeNull();
    expect(container.textContent?.toLowerCase()).toMatch(/khách chưa có tài khoản|khách vãng lai/);
    expect(container.textContent).toContain('30%');

    // Các trường input chính
    expect(container.querySelector('input[name="customerName"]')).not.toBeNull();
    expect(container.querySelector('input[name="customerPhone"]')).not.toBeNull();
    expect(container.querySelector('input[name="customerEmail"]')).not.toBeNull();

    // Submit form rỗng -> hiển thị lỗi role="alert"
    const form = container.querySelector('form');
    act(() => {
      form?.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(onCreated).not.toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
  });

  it('GuestOtpDialog renders 6 digit input boxes and buttons', () => {
    const container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    const root = createRoot(container);

    const onVerify = jest.fn(async () => {});
    const onResend = jest.fn(async () => {});
    const onClose = jest.fn();

    act(() => {
      root.render(
        <GuestOtpDialog
          email="test@example.com"
          isOpen={true}
          onClose={onClose}
          onVerify={onVerify}
          onResend={onResend}
        />,
      );
    });

    expect(container.querySelector('.guest-otp-card')).not.toBeNull();
    expect(container.textContent).toContain('test@example.com');
    const inputs = container.querySelectorAll('.guest-otp-digit');
    expect(inputs.length).toBe(6);

    act(() => root.unmount());
    container.remove();
  });

  it('BookingQrModal renders popup modal with VietQR/PayOS details and backdrop', () => {
    const container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    const root = createRoot(container);

    const onCancel = jest.fn(async () => {});
    const onClose = jest.fn();

    act(() => {
      root.render(
        <BookingQrModal
          isOpen={true}
          bookingId="book-1"
          bookingCode="BK-9999"
          courtName="Sân Pickleball 1"
          prepaymentAmount={150000}
          totalAmount={500000}
          holdExpiresAt={new Date(Date.now() + 300000).toISOString()}
          onCancel={onCancel}
          onClose={onClose}
        />,
      );
    });

    expect(container.querySelector('.arena-qr-card')).not.toBeNull();
    expect(container.querySelector('.arena-qr-backdrop')).not.toBeNull();
    expect(container.textContent).toContain('BK-9999');
    expect(container.textContent).toContain('Sân Pickleball 1');
    expect(container.textContent).toContain('150.000');
    expect(container.textContent).toContain('Hủy đơn đặt sân này');

    act(() => root.unmount());
    container.remove();
  });

  it('PendingBookingAlert renders banner with pending order details and actions', () => {
    const container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    const root = createRoot(container);

    const pending: PendingBookingState = {
      bookingId: 'book-pending',
      bookingCode: 'PENDING-123',
      courtId: 'court-1',
      courtName: 'Sân Trung Tâm',
      startsAt: '2026-10-30T08:00:00Z',
      endsAt: '2026-10-30T10:00:00Z',
      prepaymentAmount: 180000,
      holdExpiresAt: new Date(Date.now() + 240000).toISOString(),
      type: 'guest',
    };

    const onResume = jest.fn();
    const onCancel = jest.fn(async () => {});

    act(() => {
      root.render(
        <PendingBookingAlert
          pending={pending}
          onResume={onResume}
          onCancel={onCancel}
        />,
      );
    });

    expect(container.querySelector('.arena-pending-alert-banner')).not.toBeNull();
    expect(container.textContent).toContain('PENDING-123');
    expect(container.textContent).toContain('Sân Trung Tâm');
    expect(container.textContent).toContain('Tiếp tục thanh toán');
    expect(container.textContent).toContain('Hủy đơn này');

    act(() => root.unmount());
    container.remove();
  });

  it('GuestBookingModal renders dialog with court info, 30% deposit calculation, and validates inputs', () => {
    const container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    const root = createRoot(container);

    const onClose = jest.fn();
    const onCreated = jest.fn();

    act(() => {
      root.render(
        <GuestBookingModal
          isOpen={true}
          onClose={onClose}
          courtId="court-1"
          courtName="Sân VIP 1"
          courtCode="VIP-01"
          preselectedWindow={{
            start: '2026-10-30T08:00',
            end: '2026-10-30T10:00',
          }}
          totalAmount={400000}
          prepaymentAmount={120000}
          onCreated={onCreated}
        />,
      );
    });

    expect(container.querySelector('.arena-guest-modal-backdrop')).not.toBeNull();
    expect(container.querySelector('.arena-guest-modal-card')).not.toBeNull();
    expect(container.textContent).toContain('Khách chưa có tài khoản');
    expect(container.textContent).toContain('Thông tin người đặt sân');
    expect(container.textContent).toContain('Sân VIP 1');
    expect(container.textContent).toContain('120.000');
    expect(container.textContent).toContain('400.000');
    // Không có nút đổi giờ hay input đổi giờ bên trong modal (theo yêu cầu tối ưu UX)
    expect(container.querySelector('.preview-change-time-btn')).toBeNull();
    expect(container.querySelector('.guest-datetime-wrapper')).toBeNull();

    // Nhấp vào backdrop (ra ngoài) KHÔNG ĐƯỢC đóng modal
    const backdrop = container.querySelector('.arena-guest-modal-backdrop') as HTMLElement | null;
    expect(backdrop).not.toBeNull();
    act(() => {
      backdrop?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();

    // CHỈ đóng khi bấm nút X
    const closeBtn = container.querySelector('.arena-modal-close-btn') as HTMLButtonElement | null;
    expect(closeBtn).not.toBeNull();
    act(() => {
      closeBtn?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Submit form rỗng -> hiển thị alert lỗi
    const form = container.querySelector('form');
    act(() => {
      form?.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(onCreated).not.toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
  });

  it('correctly disables past slots for today and keeps future slots active', () => {
    // Giả lập mốc thời gian: 29/10/2026 lúc 14:19 chiều (Asia/Ho_Chi_Minh = UTC 07:19)
    const fixedNow = new Date('2026-10-29T07:19:00Z');

    // Kiểm tra hàm isSlotInPast
    expect(isSlotInPast('2026-10-29', 8, DEFAULT_BOOKING_TIMEZONE, fixedNow)).toBe(true);
    expect(isSlotInPast('2026-10-29', 13, DEFAULT_BOOKING_TIMEZONE, fixedNow)).toBe(true);
    expect(isSlotInPast('2026-10-29', 14, DEFAULT_BOOKING_TIMEZONE, fixedNow)).toBe(true);
    expect(isSlotInPast('2026-10-29', 15, DEFAULT_BOOKING_TIMEZONE, fixedNow)).toBe(false);
    expect(isSlotInPast('2026-10-29', 18, DEFAULT_BOOKING_TIMEZONE, fixedNow)).toBe(false);

    // Ngày mai -> tất cả các giờ từ sáng đều chưa qua
    expect(isSlotInPast('2026-10-30', 8, DEFAULT_BOOKING_TIMEZONE, fixedNow)).toBe(false);

    // Kiểm tra isWindowInPast
    expect(
      isWindowInPast(
        { start: '2026-10-29T08:00', end: '2026-10-29T09:00' },
        DEFAULT_BOOKING_TIMEZONE,
        fixedNow,
      ),
    ).toBe(true);
    expect(
      isWindowInPast(
        { start: '2026-10-29T16:00', end: '2026-10-29T17:00' },
        DEFAULT_BOOKING_TIMEZONE,
        fixedNow,
      ),
    ).toBe(false);

    // Render BookingSchedulePicker với ngày hôm nay
    const container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    const root = createRoot(container);

    const onChangeWindow = jest.fn();
    const onQuote = jest.fn();

    act(() => {
      root.render(
        <BookingSchedulePicker
          state={{
            window: { start: '2026-10-29T16:00', end: '2026-10-29T17:00' },
            busy: false,
            error: null,
            canRetry: false,
          }}
          timezone={DEFAULT_BOOKING_TIMEZONE}
          authenticated={false}
          showSignIn={true}
          signInLabel="Đăng nhập"
          onChangeWindow={onChangeWindow}
          onQuote={onQuote}
          onCreate={jest.fn()}
          onSignIn={jest.fn()}
        />,
      );
    });

    // Các nút quá khứ trên giao diện (sáng sớm 06:00, 08:00...) có class slot-past hoặc text "Đã qua giờ"
    expect(container.textContent).toContain('Đã qua giờ');

    // Nút 08:00 - 09:00 phải bị disabled
    const slot08 = container.querySelector('button[aria-label^="08:00"]') as HTMLButtonElement | null;
    expect(slot08).not.toBeNull();
    expect(slot08?.disabled).toBe(true);
    expect(slot08?.getAttribute('data-past')).toBe('true');
    expect(slot08?.textContent).toContain('Đã qua giờ');

    // Nút "Kiểm tra lịch & giá" đã được loại bỏ hoàn toàn khỏi giao diện (tự động tính giá)
    expect(container.textContent).not.toContain('Kiểm tra lịch & giá');

    // Phần CustomTimeRange được đưa lên trên ngay dưới tiêu đề và ngày chơi
    expect(container.querySelector('.schedule-custom-wrapper')).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('selectPreset supports click to toggle unselect, range shrinking, and jumping slots', () => {
    const baseWindow = { start: '2026-10-29T', end: '2026-10-29T' };

    // 1. Chọn slot 19
    const win19 = selectPreset(baseWindow, 19);
    expect(win19).toEqual({ start: '2026-10-29T19:00', end: '2026-10-29T20:00' });

    // 2. Click lại chính slot 19 -> BỎ CHỌN
    const unselected = selectPreset(win19, 19);
    expect(unselected).toEqual({ start: '2026-10-29T', end: '2026-10-29T' });

    // 3. Mở rộng dải liền kề: 19 + 20 -> 19:00 đến 21:00
    const win19_20 = selectPreset(win19, 20);
    expect(win19_20).toEqual({ start: '2026-10-29T19:00', end: '2026-10-29T21:00' });

    // 4. Click lại slot 20 (ở cuối dải) -> thu hẹp bỏ slot 20, giữ lại slot 19
    const shrinkRight = selectPreset(win19_20, 20);
    expect(shrinkRight).toEqual({ start: '2026-10-29T19:00', end: '2026-10-29T20:00' });

    // 5. Click lại slot 19 (ở đầu dải) -> thu hẹp bỏ slot 19, giữ lại slot 20
    const shrinkLeft = selectPreset(win19_20, 19);
    expect(shrinkLeft).toEqual({ start: '2026-10-29T20:00', end: '2026-10-29T21:00' });

    // 6. Chọn nhảy giờ: đang chọn slot 19 mà click slot 8 (không liền kề) -> reset dải cũ và chọn slot 8
    const jumpSlot = selectPreset(win19, 8);
    expect(jumpSlot).toEqual({ start: '2026-10-29T08:00', end: '2026-10-29T09:00' });
  });

  it('assertBookableWindow strictly rejects past time slots and invalid ranges', () => {
    // 29/10/2026 lúc 14:19 chiều (Asia/Ho_Chi_Minh)
    const fixedNow = new Date('2026-10-29T07:19:00Z');

    // Khung giờ 10:00 AM - 10:00 PM của ngày hôm nay đã bị quá giờ bắt đầu
    expect(() =>
      assertBookableWindow(
        { start: '2026-10-29T10:00', end: '2026-10-29T22:00' },
        DEFAULT_BOOKING_TIMEZONE,
        fixedNow,
      ),
    ).toThrow('Khung giờ bắt đầu đã qua thời gian hiện tại');

    // Khung giờ kết thúc trước bắt đầu
    expect(() =>
      assertBookableWindow(
        { start: '2026-10-29T20:00', end: '2026-10-29T18:00' },
        DEFAULT_BOOKING_TIMEZONE,
        fixedNow,
      ),
    ).toThrow('Giờ kết thúc phải sau giờ bắt đầu');

    // Khung giờ tương lai hợp lệ
    expect(() =>
      assertBookableWindow(
        { start: '2026-10-29T19:00', end: '2026-10-29T21:00' },
        DEFAULT_BOOKING_TIMEZONE,
        fixedNow,
      ),
    ).not.toThrow();
  });

  it('calculateEstimatedPrices calculates instantaneous pricing on rapid slot clicks', () => {
    // Giá sân 84.000 đ/giờ, chọn 1 tiếng: 22:00 - 23:00
    const oneHour = calculateEstimatedPrices({
      start: '2026-10-29T22:00',
      end: '2026-10-29T23:00',
      pricePerHour: 84000,
    });
    expect(oneHour).not.toBeNull();
    expect(oneHour?.courtTotal).toBe(84000);
    expect(oneHour?.total).toBe(84000);
    // Cọc 30%: 84000 * 0.3 = 25.200 đ
    expect(oneHour?.deposit).toBe(25200);
    // Còn lại tại sân 70%: 84000 - 25200 = 58.800 đ
    expect(oneHour?.remaining).toBe(58800);

    // Chọn dải 2 tiếng: 19:00 - 21:00
    const twoHours = calculateEstimatedPrices({
      start: '2026-10-29T19:00',
      end: '2026-10-29T21:00',
      pricePerHour: 100000,
    });
    expect(twoHours?.courtTotal).toBe(200000);
    expect(twoHours?.total).toBe(200000);
    expect(twoHours?.deposit).toBe(60000);
    expect(twoHours?.remaining).toBe(140000);

    // Thêm dịch vụ nước uống (SALE: 15.000 đ x 2 chai = 30.000 đ)
    const withServices = calculateEstimatedPrices({
      start: '2026-10-29T19:00',
      end: '2026-10-29T21:00',
      pricePerHour: 100000,
      services: [{ productId: 'drink-1', quantity: 2 }],
      products: [
        {
          id: 'drink-1',
          code: 'WATER',
          name: 'Nước khoáng',
          kind: 'DRINK',
          billingMode: 'SALE',
          unit: 'chai',
          unitPrice: 15000,
        },
      ],
    });
    expect(withServices?.courtTotal).toBe(200000);
    expect(withServices?.servicesTotal).toBe(30000);
    expect(withServices?.total).toBe(230000);
    expect(withServices?.deposit).toBe(Math.floor((230000 * 30 + 50) / 100));

    // Không có giờ hoặc giờ không hợp lệ -> trả về null an toàn
    expect(
      calculateEstimatedPrices({
        start: '2026-10-29T22:00',
        end: '2026-10-29T20:00',
        pricePerHour: 84000,
      }),
    ).toBeNull();
  });
});
