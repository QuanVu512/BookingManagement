import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import type { CourtItem } from '../features/courts/model/court';
import type { BookingRecord } from '../features/booking/model/booking';

const dom = new JSDOM('<div id="app"></div>', {
  url: 'http://localhost:14001',
});
Object.defineProperty(globalThis, 'self', {
  value: dom.window,
  configurable: true,
});
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
}))
  Object.defineProperty(globalThis, name, { value, configurable: true });
jest.unstable_mockModule('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) =>
    createElement('img', { src, alt }),
}));
const { createRoot } = await import('react-dom/client');
const { CourtCatalogView } =
  await import('../features/courts/components/court-catalog-view');
const { BookingTicketList } =
  await import('../features/booking/components/booking-ticket-list');
const { MyBookingsView } =
  await import('../features/booking/components/my-bookings-view');
const { bookingDays } =
  await import('../features/booking/components/booking-day-strip');
const court: CourtItem = {
  id: 'court-1',
  code: 'VIP-01',
  name: 'Sân từ API',
  courtType: 'VIP',
  status: 'ACTIVE',
  surfaceType: 'Cushion thật',
  features: ['Đèn sân'],
  pricePerHour: 123000,
  imageUrl: '/courts/test.jpg',
  rating: 0,
  reviewCount: 0,
};
const booking: BookingRecord = {
  id: 'booking-1',
  bookingCode: 'BK-API-01',
  courtId: court.id,
  courtName: court.name,
  timezone: 'Asia/Ho_Chi_Minh',
  startsAt: '2035-01-08T01:00:00Z',
  endsAt: '2035-01-08T02:00:00Z',
  holdExpiresAt: '2035-01-08T00:05:00Z',
  status: 'HOLDING',
  totalAmount: 123000,
  currency: 'VND',
  priceItems: [],
};
let root: ReturnType<typeof createRoot>;
function button(label: string) {
  return [...document.querySelectorAll('button')].find((control) =>
    control.textContent?.includes(label),
  );
}
beforeEach(() => {
  const container = document.getElementById('app');
  if (!container) throw new Error('Missing root');
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  jest.restoreAllMocks();
});

describe('Gemini design connected to real-shaped data', () => {
  it('keeps the real session gate before rendering personal tickets', async () => {
    const signIn = jest.fn();
    const props = {
      sessionLoading: true,
      authenticated: false,
      bookings: [booking],
      loading: false,
      error: '',
      pendingId: '',
      nextCursor: null,
      signInLabel: 'Đăng nhập',
      onReload: jest.fn(),
      onCancel: jest.fn(),
      onSignIn: signIn,
    };
    await act(async () => root.render(<MyBookingsView {...props} />));
    expect(document.querySelector('[role=status]')?.textContent).toContain(
      'Đang kiểm tra phiên',
    );
    expect(document.querySelector('.arena-ticket')).toBeNull();
    await act(async () =>
      root.render(<MyBookingsView {...props} sessionLoading={false} />),
    );
    await act(async () => button('Đăng nhập')?.click());
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.arena-ticket')).toBeNull();
  });
  it('keeps catalog layout, filtering, prices and destination from supplied API data', async () => {
    await act(async () =>
      root.render(
        <CourtCatalogView
          courts={[
            court,
            {
              ...court,
              id: 'court-2',
              courtType: 'STANDARD',
              name: 'Sân tiêu chuẩn thật',
            },
          ]}
        />,
      ),
    );
    expect(document.querySelectorAll('.arena-court-card')).toHaveLength(2);
    expect(document.body.textContent).toContain('123.000');
    expect(document.body.textContent).not.toContain('Quân Vũ');
    expect(document.querySelector('a[href="/courts/court-1"]')).not.toBeNull();
    await act(async () => button('Sân VIP')?.click());
    expect(document.querySelectorAll('.arena-court-card')).toHaveLength(1);
    expect(document.body.textContent).not.toContain('Sân tiêu chuẩn thật');
  });
  it('renders ticket status truthfully and asks before dispatching the existing cancellation callback', async () => {
    const cancel = jest.fn();
    await act(async () =>
      root.render(
        <BookingTicketList
          bookings={[booking]}
          pendingId=""
          nextCursor={null}
          onCancel={cancel}
        />,
      ),
    );
    expect(document.body.textContent).toContain(
      'Đang giữ chỗ — chưa thanh toán',
    );
    expect(document.body.textContent).not.toContain('VÉ HỢP LỆ');
    expect(document.querySelector('.arena-ticket-pass svg rect')).toBeNull();
    await act(async () => button('Hủy giữ chỗ')?.click());
    expect(document.querySelector('[role=dialog]')).not.toBeNull();
    expect(cancel).not.toHaveBeenCalled();
    await act(async () => button('Giữ lại lượt đặt')?.click());
    expect(document.querySelector('[role=dialog]')).toBeNull();
    await act(async () => button('Hủy giữ chỗ')?.click());
    await act(async () => button('Đồng ý hủy')?.click());
    expect(cancel).toHaveBeenCalledWith(booking.id);
    expect(document.body.textContent).not.toContain('hoàn trả tự động');
  });
  it('filters statuses without inventing more bookings and supports dialog Escape', async () => {
    await act(async () =>
      root.render(
        <BookingTicketList
          bookings={[
            booking,
            {
              ...booking,
              id: 'cancelled',
              bookingCode: 'BK-CANCELLED',
              status: 'CANCELLED',
            },
          ]}
          pendingId=""
          nextCursor="next"
          onCancel={jest.fn()}
        />,
      ),
    );
    expect(document.querySelectorAll('.arena-ticket')).toHaveLength(1);
    await act(async () => button('Hủy giữ chỗ')?.click());
    await act(async () =>
      document.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
        }),
      ),
    );
    expect(document.querySelector('[role=dialog]')).toBeNull();
    await act(async () => button('Đã hủy / Hết hạn')?.click());
    expect(document.querySelectorAll('.arena-ticket')).toHaveLength(1);
    expect(document.body.textContent).toContain('BK-CANCELLED');
    expect(document.body.textContent).not.toContain('BK-API-01');
    expect(document.body.textContent).toContain('Số lượng tính trên');
  });
  it('builds the seven-day strip across year boundaries without hardcoded 2026 dates', () => {
    const days = bookingDays('2026-12-30');
    expect(days).toHaveLength(7);
    expect(days[0].label).toBe('Hôm nay');
    expect(days[1].label).toBe('Ngày mai');
    expect(days[2].value).toBe('2027-01-01');
    expect(days[6].value).toBe('2027-01-05');
  });
});
