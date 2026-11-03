import { describe, expect, it, jest } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import QRCode from 'qrcode';
import {
  BookingPaymentCheckout,
  PaymentStatusPanel,
} from '../features/payment/components/payment-status-panel.js';
import { BookingQrModal } from '../features/payment/components/booking-qr-modal.js';

const dom = new JSDOM('<div id="app"></div>', {
  url: 'http://127.0.0.1:14002',
});
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  IS_REACT_ACT_ENVIRONMENT: true,
}))
  Object.defineProperty(globalThis, name, { value, configurable: true });
const { createRoot } = await import('react-dom/client');

const baseRequest = {
  id: 'req-1',
  paymentCode: 'PAY-ABC123',
  purpose: 'PREPAYMENT' as const,
  amount: 45000,
  currency: 'VND',
  method: 'PAYOS_TRANSFER' as const,
  providerOrderCode: null,
  checkoutUrl: 'https://pay.payos.vn/web/abc',
  status: 'PENDING' as const,
  expiresAt: null,
  reviewRequired: false,
  reviewReasonCode: null,
};

function render(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

describe('Hiển thị trạng thái thanh toán PaymentStatusPanel (FE-PAY-05/06: trạng thái đơn hàng, MIG-14/17: đếm ngược và hỗ trợ)', () => {
  it('FE-PAY-05 (Xác nhận thành công): chỉ hiển thị "Đặt sân thành công" khi máy chủ xác nhận (màn hình SCR04_SUCCESS và đơn CONFIRMED)', () => {
    const { container, root } = render(
      <PaymentStatusPanel
        request={baseRequest}
        outcome={{
          screen: 'SCR04_SUCCESS',
          reviewRequired: false,
          reviewReasonCode: null,
          bookingStatus: 'CONFIRMED',
          netCredited: 45000,
          requiredPrepaymentAmount: 45000,
        }}
        serverNow={null}
        supportPhone={null}
        onRefresh={() => {}}
        onRetry={() => {}}
      />,
    );
    expect(container.textContent).toContain('Đặt sân thành công');
    expect(container.textContent).not.toContain('chưa bị trừ tiền');
    act(() => root.unmount());
    container.remove();
  });

  it('FE-PAY-06 (Hết hạn giữ chỗ): hiển thị thông báo trung thực "Giữ chỗ đã hết hạn", không tự ý hứa hẹn về tiền bạc', () => {
    const { container, root } = render(
      <PaymentStatusPanel
        request={baseRequest}
        outcome={{
          screen: 'SCR05_EXPIRED',
          reviewRequired: false,
          reviewReasonCode: null,
          bookingStatus: 'EXPIRED',
          netCredited: 0,
          requiredPrepaymentAmount: 45000,
        }}
        serverNow={null}
        supportPhone={null}
        onRefresh={() => {}}
        onRetry={() => {}}
      />,
    );
    expect(container.textContent).toContain('Giữ chỗ đã hết hạn');
    expect(container.textContent).not.toContain('đảm bảo');
    act(() => root.unmount());
    container.remove();
  });

  it('FE-PAY-06 (Khoản thanh toán cần tra soát): hiển thị trạng thái chờ tra soát, kèm mã thanh toán và nút tải lại', () => {
    const onRefresh = jest.fn();
    const { container, root } = render(
      <PaymentStatusPanel
        request={baseRequest}
        outcome={{
          screen: 'SCR06_REVIEW',
          reviewRequired: true,
          reviewReasonCode: 'LATE_PAYMENT_REVIEW',
          bookingStatus: 'EXPIRED',
          netCredited: 45000,
          requiredPrepaymentAmount: 45000,
        }}
        serverNow={null}
        supportPhone={'19000000'}
        onRefresh={onRefresh}
        onRetry={() => {}}
      />,
    );
    expect(container.textContent).toContain('cần tra soát');
    expect(container.textContent).toContain('PAY-ABC123');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    const buttons = [...container.querySelectorAll('button')].map(
      (button) => button.textContent,
    );
    expect(buttons).toContain('Tải lại trạng thái');
    act(() => root.unmount());
    container.remove();
  });

  it('MIG-17 (Hotline hỗ trợ): ẩn nút gọi hỗ trợ khi chưa cấu hình số điện thoại hotline', () => {
    const { container, root } = render(
      <PaymentStatusPanel
        request={baseRequest}
        outcome={null}
        serverNow={null}
        supportPhone={null}
        onRefresh={() => {}}
        onRetry={() => {}}
      />,
    );
    expect(container.textContent).not.toContain('tel:');
    act(() => root.unmount());
    container.remove();
  });
});

describe('Hiển thị mã QR thanh toán và đồng hồ đếm ngược thời hạn thanh toán', () => {
  it('FE-PAY-05 (Mã QR và đếm ngược): hiển thị mã QR từ ngân hàng, đếm ngược thời gian và thử lại dùng cùng khóa thanh toán', async () => {
    const keys: string[] = [];
    const qr = jest
      .spyOn(QRCode, 'toCanvas')
      .mockImplementation(async () => undefined);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 300000).toISOString();
    const request = {
      ...baseRequest,
      expiresAt,
      vietQrPayload: 'provider-verified-qr-payload',
    };
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url, options) => {
        const path =
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.href
              : url.url;
        if (path.endsWith('/auth/csrf'))
          return new Response(JSON.stringify({ token: 'a'.repeat(64) }));
        if (options?.method === 'POST') {
          const body: unknown = JSON.parse(
            typeof options.body === 'string' ? options.body : '{}',
          );
          if (
            typeof body === 'object' &&
            body &&
            'idempotencyKey' in body &&
            typeof body.idempotencyKey === 'string'
          )
            keys.push(body.idempotencyKey);
        }
        return new Response(
          JSON.stringify({
            success: true,
            data: path.endsWith('/status')
              ? {
                  screen: 'SCR_PENDING',
                  reviewRequired: false,
                  reviewReasonCode: null,
                  bookingStatus: 'HOLDING',
                  netCredited: 0,
                  requiredPrepaymentAmount: 100000,
                  serverNow: now,
                }
              : request,
          }),
        );
      });
    const booking = {
      id: 'booking-qr',
      bookingCode: 'BK-QR',
      courtId: 'court',
      courtName: 'Court',
      timezone: 'Asia/Ho_Chi_Minh',
      startsAt: now,
      endsAt: expiresAt,
      holdExpiresAt: expiresAt,
      status: 'HOLDING' as const,
      totalAmount: 100000,
      currency: 'VND',
      priceItems: [],
    };
    const { container, root } = render(
      <BookingPaymentCheckout booking={booking} />,
    );
    try {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      expect(
        container.querySelector(
          'canvas[aria-label="Mã QR thanh toán đơn đặt sân"]',
        ),
      ).not.toBeNull();
      expect(qr.mock.calls[0]?.[1]).toBe('provider-verified-qr-payload');
      expect(container.textContent).not.toContain('Đặt sân thành công');
      const before = container.querySelector('[role="timer"]')?.textContent;
      const startedAt = Date.now();
      while (
        container.querySelector('[role="timer"]')?.textContent === before &&
        Date.now() - startedAt < 4000
      ) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
        });
      }
      expect(container.querySelector('[role="timer"]')?.textContent).not.toBe(
        before,
      );
      const beforeRetry =
        container.querySelector('[role="timer"]')?.textContent ?? '';
      await act(async () => container.querySelector('button')?.click());
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      expect(
        (container.querySelector('[role="timer"]')?.textContent ?? '') <=
          beforeRetry,
      ).toBe(true);
      expect(keys).toHaveLength(2);
      expect(keys[0]).toBe(keys[1]);
    } finally {
      act(() => root.unmount());
      container.remove();
      fetch.mockRestore();
      qr.mockRestore();
    }
  });
});

describe('Bước 3 — Chỉ hiển thị mã QR do máy chủ và ngân hàng xác nhận', () => {
  function mockCheckoutFetch(status: string) {
    const posts: string[] = [];
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url, options) => {
        const path =
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.href
              : url.url;
        if (path.endsWith('/auth/csrf'))
          return new Response(JSON.stringify({ token: 'a'.repeat(64) }));
        if (options?.method === 'POST') {
          const body: unknown = JSON.parse(
            typeof options.body === 'string' ? options.body : '{}',
          );
          if (
            typeof body === 'object' &&
            body &&
            'idempotencyKey' in body &&
            typeof body.idempotencyKey === 'string'
          )
            posts.push(body.idempotencyKey);
        }
        const data = path.endsWith('/status')
          ? {
              screen: 'SCR_PENDING',
              reviewRequired: false,
              reviewReasonCode: null,
              bookingStatus: 'HOLDING',
              netCredited: 0,
              requiredPrepaymentAmount: 30000,
              serverNow: new Date().toISOString(),
            }
          : {
              ...baseRequest,
              status,
              vietQrPayload: null,
              checkoutUrl: null,
              expiresAt: new Date(Date.now() + 300000).toISOString(),
            };
        return new Response(JSON.stringify({ success: true, data }));
      });
    return { fetch, posts };
  }

  it('B3-01 (Đang tạo mã thanh toán CREATING): hiển thị trạng thái chờ, không vẽ mã QR rác hay dữ liệu tự ghép', async () => {
    const { fetch, posts } = mockCheckoutFetch('CREATING');
    const { container, root } = render(
      <BookingQrModal
        isOpen
        bookingId="booking-qr-creating"
        bookingCode="BK-CREATING"
        prepaymentAmount={30000}
      />,
    );
    try {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      expect(container.textContent).toContain(
        'Đang khởi tạo mã thanh toán từ ngân hàng',
      );
      expect(container.querySelector('canvas')).toBeNull();
      expect(container.textContent).not.toContain('000201');
      expect(container.textContent).not.toContain('img.vietqr.io');
      expect(container.textContent).not.toContain('Thử tạo lại mã QR');
      expect(posts).toHaveLength(1);
      expect(posts[0]).toBe('booking-checkout:booking-qr-creating');
    } finally {
      act(() => root.unmount());
      container.remove();
      fetch.mockRestore();
    }
  });

  it('B3-02 (Tạo mã thất bại FAILED): hiển thị thông báo lỗi và nút thử lại dùng cùng khóa yêu cầu ban đầu', async () => {
    const { fetch, posts } = mockCheckoutFetch('FAILED');
    const { container, root } = render(
      <BookingQrModal
        isOpen
        bookingId="booking-qr-failed"
        bookingCode="BK-FAILED"
        prepaymentAmount={30000}
      />,
    );
    try {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      expect(container.querySelector('[role="alert"]')).not.toBeNull();
      expect(container.textContent).toContain('Chưa tạo được mã thanh toán');
      expect(container.querySelector('canvas')).toBeNull();
      const retry = [...container.querySelectorAll('button')].find(
        (button) => button.textContent === 'Thử tạo lại mã QR',
      );
      expect(retry).not.toBeUndefined();
      await act(async () => retry?.click());
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      expect(posts).toHaveLength(2);
      expect(posts[0]).toBe(posts[1]);
    } finally {
      act(() => root.unmount());
      container.remove();
      fetch.mockRestore();
    }
  });
});

describe('Khóa giao diện thanh toán khi đơn kết thúc hoặc bị hủy (P1-2: đơn hủy, P2-3: dừng kiểm tra khi lỗi, P2-4: khóa nút khi hủy)', () => {
  type MockOptions = {
    createStatus: string;
    payload?: string | null;
    outcome?: Record<string, unknown>;
    failReads?: boolean;
  };

  function mockCheckout(options: MockOptions) {
    const counts = { post: 0, read: 0, outcome: 0 };
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url, init) => {
        const path =
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.href
              : url.url;
        if (path.endsWith('/auth/csrf'))
          return new Response(JSON.stringify({ token: 'a'.repeat(64) }));
        if (init?.method === 'POST') {
          counts.post += 1;
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                ...baseRequest,
                status: options.createStatus,
                vietQrPayload: options.payload ?? null,
                checkoutUrl: options.payload
                  ? 'https://pay.example/checkout'
                  : null,
                expiresAt: new Date(Date.now() + 300000).toISOString(),
              },
            }),
          );
        }
        if (options.failReads) return new Response('{}', { status: 500 });
        if (path.endsWith('/status')) {
          counts.outcome += 1;
          return new Response(
            JSON.stringify({
              success: true,
              data: options.outcome ?? {
                screen: 'SCR_PENDING',
                reviewRequired: false,
                reviewReasonCode: null,
                bookingStatus: 'HOLDING',
                netCredited: 0,
                requiredPrepaymentAmount: 30000,
                serverNow: new Date().toISOString(),
              },
            }),
          );
        }
        counts.read += 1;
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              ...baseRequest,
              status: options.createStatus,
              vietQrPayload: options.payload ?? null,
            },
          }),
        );
      });
    return { fetch, counts };
  }

  it('P1-2 (Đơn đặt sân đã hủy CANCELLED): không hiển thị mã QR và đường link thanh toán dù dữ liệu cũ còn lưu', async () => {
    const { fetch } = mockCheckout({
      createStatus: 'PENDING',
      payload: '00020101021228540010A000000727',
      outcome: {
        screen: 'SCR_CANCELLED',
        reviewRequired: false,
        reviewReasonCode: null,
        bookingStatus: 'CANCELLED',
        netCredited: 0,
        requiredPrepaymentAmount: 30000,
        serverNow: new Date().toISOString(),
      },
    });
    const { container, root } = render(
      <BookingQrModal
        isOpen
        bookingId="booking-qr-cancelled"
        bookingCode="BK-CANCELLED"
        prepaymentAmount={30000}
      />,
    );
    try {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
      });
      expect(container.querySelector('canvas')).toBeNull();
      expect(container.textContent).toContain('Đơn đã kết thúc');
      expect(container.textContent).not.toContain('Mở link thanh toán PayOS');
      expect(container.textContent).not.toContain('Thử tạo lại mã QR');
      expect(container.textContent).not.toContain('Hủy đơn đặt sân này');
    } finally {
      act(() => root.unmount());
      container.remove();
      fetch.mockRestore();
    }
  });

  it('P2-4 (Yêu cầu thanh toán đã hủy CANCELLED gặp lỗi mạng): hiển thị thông báo kết thúc, không hiện nút tạo lại mã', async () => {
    const { fetch } = mockCheckout({
      createStatus: 'CANCELLED',
      failReads: true,
    });
    const { container, root } = render(
      <BookingQrModal
        isOpen
        bookingId="booking-qr-ended"
        bookingCode="BK-ENDED"
        prepaymentAmount={30000}
      />,
    );
    try {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
      });
      expect(container.textContent).toContain(
        'Yêu cầu thanh toán đã kết thúc',
      );
      expect(container.textContent).not.toContain('Thử tạo lại mã QR');
      expect(container.querySelector('canvas')).toBeNull();
    } finally {
      act(() => root.unmount());
      container.remove();
      fetch.mockRestore();
    }
  });

  it('P2-3 (Yêu cầu thanh toán thất bại FAILED): dừng tự động kiểm tra định kỳ để tránh gửi yêu cầu liên tục lên máy chủ', async () => {
    const { fetch, counts } = mockCheckout({ createStatus: 'FAILED' });
    const { container, root } = render(
      <BookingQrModal
        isOpen
        bookingId="booking-qr-poll-stop"
        bookingCode="BK-POLL"
        prepaymentAmount={30000}
      />,
    );
    try {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });
      const afterFirstRead = counts.read + counts.outcome;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 3400));
      });
      // Poll mặc định 3s/lần: nếu không dừng, reads sẽ tăng sau 3.4s.
      expect(counts.read + counts.outcome).toBe(afterFirstRead);
      expect(counts.post).toBe(1);
    } finally {
      act(() => root.unmount());
      container.remove();
      fetch.mockRestore();
    }
  });
});

describe('RR-P2-4 — Khung thanh toán không tự ý gửi yêu cầu tạo mới POST khi đơn đã kết thúc hoặc đang tra soát', () => {
  type PanelOptions = {
    createStatus: string;
    payload?: string | null;
    outcome?: Record<string, unknown>;
    failReads?: boolean;
    expiresInMs?: number;
  };

  function mockPanel(options: PanelOptions) {
    const counts = { post: 0 };
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url, init) => {
        const path =
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.href
              : url.url;
        if (path.endsWith('/auth/csrf'))
          return new Response(JSON.stringify({ token: 'a'.repeat(64) }));
        if (init?.method === 'POST') {
          counts.post += 1;
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                ...baseRequest,
                status: options.createStatus,
                vietQrPayload: options.payload ?? null,
                checkoutUrl: options.payload
                  ? 'https://pay.example/checkout'
                  : null,
                expiresAt: new Date(
                  Date.now() + (options.expiresInMs ?? 300000),
                ).toISOString(),
              },
            }),
          );
        }
        if (options.failReads) return new Response('{}', { status: 500 });
        if (path.endsWith('/status')) {
          return new Response(
            JSON.stringify({ success: true, data: options.outcome }),
          );
        }
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              ...baseRequest,
              status: options.createStatus,
              vietQrPayload: options.payload ?? null,
            },
          }),
        );
      });
    return { fetch, counts };
  }

  function panelBooking(expiresInMs = 300000) {
    const now = new Date();
    return {
      id: 'booking-panel-locked',
      bookingCode: 'BK-LOCKED',
      courtId: 'court',
      courtName: 'Court',
      timezone: 'Asia/Ho_Chi_Minh',
      startsAt: now.toISOString(),
      endsAt: new Date(now.getTime() + 3600000).toISOString(),
      holdExpiresAt: new Date(now.getTime() + expiresInMs).toISOString(),
      status: 'HOLDING' as const,
      totalAmount: 100000,
      currency: 'VND',
      priceItems: [],
    };
  }

  function retryButton(container: Element) {
    return [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Tải lại thanh toán',
    );
  }

  it('RR-P2-4A (Đơn đặt sân đã hủy CANCELLED): ẩn nút tải lại, không gửi thêm yêu cầu thanh toán POST', async () => {
    const { fetch, counts } = mockPanel({
      createStatus: 'PENDING',
      payload: '00020101021238540010A000000727',
      outcome: {
        screen: 'SCR_CANCELLED',
        reviewRequired: false,
        reviewReasonCode: null,
        bookingStatus: 'CANCELLED',
        netCredited: 0,
        requiredPrepaymentAmount: 30000,
        serverNow: new Date().toISOString(),
      },
    });
    const { container, root } = render(
      <BookingPaymentCheckout booking={panelBooking()} />,
    );
    try {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 800));
      });
      expect(retryButton(container)).toBeUndefined();
      expect(container.querySelector('canvas')).toBeNull();
      expect(counts.post).toBe(1);
    } finally {
      act(() => root.unmount());
      container.remove();
      fetch.mockRestore();
    }
  });

  it('RR-P2-4B (Khoản thanh toán đang tra soát SCR06_REVIEW): ẩn nút tải lại, không gửi thêm yêu cầu thanh toán POST', async () => {
    const { fetch, counts } = mockPanel({
      createStatus: 'PENDING',
      payload: '00020101021238540010A000000727',
      outcome: {
        screen: 'SCR06_REVIEW',
        reviewRequired: true,
        reviewReasonCode: 'LATE_PAYMENT',
        bookingStatus: 'HOLDING',
        netCredited: 30000,
        requiredPrepaymentAmount: 30000,
        serverNow: new Date().toISOString(),
      },
    });
    const { container, root } = render(
      <BookingPaymentCheckout booking={panelBooking()} />,
    );
    try {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 800));
      });
      expect(retryButton(container)).toBeUndefined();
      expect(counts.post).toBe(1);
    } finally {
      act(() => root.unmount());
      container.remove();
      fetch.mockRestore();
    }
  });

  it('RR-P2-4C (Yêu cầu thanh toán đã hủy CANCELLED và lỗi đọc): ẩn nút tải lại, không gửi thêm yêu cầu thanh toán POST', async () => {
    const { fetch, counts } = mockPanel({
      createStatus: 'CANCELLED',
      failReads: true,
    });
    const { container, root } = render(
      <BookingPaymentCheckout booking={panelBooking()} />,
    );
    try {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 800));
      });
      expect(retryButton(container)).toBeUndefined();
      expect(container.textContent).toContain(
        'Yêu cầu thanh toán đã kết thúc',
      );
      expect(counts.post).toBe(1);
    } finally {
      act(() => root.unmount());
      container.remove();
      fetch.mockRestore();
    }
  });

  it('R2-P2-1 (Đồng hồ đếm ngược hết giờ khi đơn đã kết thúc): chỉ kiểm tra lại trạng thái GET, tuyệt đối không gửi POST tạo mới', async () => {
    const { fetch, counts } = mockPanel({
      createStatus: 'PENDING',
      payload: '00020101021238540010A000000727',
      expiresInMs: 1500,
      outcome: {
        screen: 'SCR_CANCELLED',
        reviewRequired: false,
        reviewReasonCode: null,
        bookingStatus: 'CANCELLED',
        netCredited: 0,
        requiredPrepaymentAmount: 30000,
        serverNow: new Date().toISOString(),
      },
    });
    const { container, root } = render(
      <BookingPaymentCheckout booking={panelBooking(1500)} />,
    );
    try {
      // Qua deadline 1.5s: onExpired phải gọi refreshRead (GET), không POST.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 3500));
      });
      expect(counts.post).toBe(1);
      expect(retryButton(container)).toBeUndefined();
    } finally {
      act(() => root.unmount());
      container.remove();
      fetch.mockRestore();
    }
  });

  it('R2-P2-2 (Đơn đã thanh toán thành công PAID nhưng lỗi mạng khi đọc lại): không hiển thị nút thử lại để tránh trừ tiền 2 lần', async () => {
    const { fetch, counts } = mockPanel({
      createStatus: 'PAID',
      failReads: true,
    });
    const { container, root } = render(
      <BookingPaymentCheckout booking={panelBooking()} />,
    );
    try {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 800));
      });
      // PAID không được có action tạo payment dù outcome chưa đọc được.
      expect(retryButton(container)).toBeUndefined();
      expect(counts.post).toBe(1);
    } finally {
      act(() => root.unmount());
      container.remove();
      fetch.mockRestore();
    }
  });
});

describe('R3 — Quản lý vòng đời đọc lại trạng thái (chống ghi đè dữ liệu cũ và xử lý lỗi mạng an toàn)', () => {
  function staleBooking(id: string) {
    const now = new Date();
    return {
      id,
      bookingCode: `BK-${id.slice(-6).toUpperCase()}`,
      courtId: 'court',
      courtName: 'Court',
      timezone: 'Asia/Ho_Chi_Minh',
      startsAt: now.toISOString(),
      endsAt: new Date(now.getTime() + 3600000).toISOString(),
      holdExpiresAt: new Date(now.getTime() + 60000).toISOString(),
      status: 'HOLDING' as const,
      totalAmount: 100000,
      currency: 'VND',
      priceItems: [],
    };
  }

  function paymentLink(container: Element, suffix: string) {
    return [...container.querySelectorAll('a')].find((anchor) =>
      (anchor as HTMLAnchorElement).href.endsWith(`/${suffix}`),
    );
  }

  it('R3-P2-1 (Chuyển nhanh giữa hai đơn đặt sân): kết quả đọc của đơn cũ phản hồi chậm không được ghi đè lên đơn mới', async () => {
    const counts = { post: 0 };
    const held: Array<() => void> = [];
    const requestResponse = (reqId: string) =>
      new Response(
        JSON.stringify({
          success: true,
          data: {
            ...baseRequest,
            id: reqId,
            status: 'PENDING',
            vietQrPayload: `qr-${reqId}`,
            checkoutUrl: `https://pay.example/${reqId}`,
          },
        }),
      );
    const outcomeResponse = () =>
      new Response(
        JSON.stringify({
          success: true,
          data: {
            screen: 'SCR_PENDING',
            reviewRequired: false,
            reviewReasonCode: null,
            bookingStatus: 'HOLDING',
            netCredited: 0,
            requiredPrepaymentAmount: 30000,
            serverNow: new Date().toISOString(),
          },
        }),
      );
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url, init) => {
        const path =
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.href
              : url.url;
        if (path.endsWith('/auth/csrf'))
          return new Response(JSON.stringify({ token: 'a'.repeat(64) }));
        if (init?.method === 'POST') {
          const body = JSON.parse(
            typeof init.body === 'string' ? init.body : '{}',
          ) as { bookingId: string };
          counts.post += 1;
          const reqId = `req-${body.bookingId}`;
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                ...baseRequest,
                id: reqId,
                status: 'PENDING',
                vietQrPayload: `qr-${reqId}`,
                checkoutUrl: `https://pay.example/${reqId}`,
                expiresAt: new Date(Date.now() + 1200).toISOString(),
              },
            }),
          );
        }
        const match = /requests\/([^/]+)(\/status)?$/.exec(path);
        const reqId = match?.[1] ?? '';
        // Giữ mọi GET của booking A; booking B trả ngay.
        if (reqId === 'req-booking-stale-a') {
          return new Promise<Response>((resolve) => {
            held.push(() =>
              resolve(
                path.endsWith('/status')
                  ? outcomeResponse()
                  : requestResponse(reqId),
              ),
            );
          });
        }
        return path.endsWith('/status')
          ? outcomeResponse()
          : requestResponse(reqId);
      });

    const { container, root } = render(
      <BookingPaymentCheckout booking={staleBooking('booking-stale-a')} />,
    );
    try {
      // Countdown 1.2s hết hạn → refreshRead phát GET (đang bị giữ).
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1800));
      });
      expect(held.length).toBeGreaterThan(0);
      // Chuyển sang booking B: POST + GET riêng, state phải là req-B.
      await act(async () => {
        root.render(
          <BookingPaymentCheckout booking={staleBooking('booking-stale-b')} />,
        );
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
      });
      expect(paymentLink(container, 'req-booking-stale-b')).not.toBeUndefined();
      // Thả response A đã giữ: state phải giữ req-B, POST không tăng.
      await act(async () => {
        held.splice(0).forEach((release) => release());
        await new Promise((resolve) => setTimeout(resolve, 300));
      });
      expect(paymentLink(container, 'req-booking-stale-b')).not.toBeUndefined();
      expect(paymentLink(container, 'req-booking-stale-a')).toBeUndefined();
      expect(counts.post).toBe(2);
    } finally {
      act(() => root.unmount());
      container.remove();
      fetch.mockRestore();
    }
  });

  it('R3-P2-2 (Tự động đọc lại trạng thái khi đếm ngược hết giờ): GET lỗi chỉ báo lỗi cập nhật, không tạo POST mới, không rejection', async () => {
    let failReads = false;
    const counts = { post: 0 };
    const expiresAt = new Date(Date.now() + 800).toISOString();
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url, init) => {
        const path =
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.href
              : url.url;
        if (path.endsWith('/auth/csrf'))
          return new Response(JSON.stringify({ token: 'a'.repeat(64) }));
        if (init?.method === 'POST') {
          counts.post += 1;
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                ...baseRequest,
                status: 'PENDING',
                vietQrPayload: 'qr-read-error',
                checkoutUrl: 'https://pay.example/read-error',
                expiresAt,
              },
            }),
          );
        }
        if (failReads) return new Response('{}', { status: 500 });
        if (path.endsWith('/status')) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                screen: 'SCR_PENDING',
                reviewRequired: false,
                reviewReasonCode: null,
                bookingStatus: 'HOLDING',
                netCredited: 0,
                requiredPrepaymentAmount: 30000,
                serverNow: new Date().toISOString(),
              },
            }),
          );
        }
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              ...baseRequest,
              vietQrPayload: 'qr-read-error',
              expiresAt,
            },
          }),
        );
      });

    const { container, root } = render(
      <BookingPaymentCheckout booking={staleBooking('booking-read-error')} />,
    );
    try {
      // Trạng thái hợp lệ trước (chờ poll đầu xong), sau đó GET lỗi đúng
      // lúc countdown gọi refreshRead — poller 3s chưa tới nên lỗi chỉ có
      // thể từ đường refreshRead.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
      });
      failReads = true;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      });
      expect(container.textContent).toContain(
        'Chưa cập nhật được thanh toán. Vui lòng thử lại.',
      );
      expect(counts.post).toBe(1);
    } finally {
      act(() => root.unmount());
      container.remove();
      fetch.mockRestore();
    }
  });
});
