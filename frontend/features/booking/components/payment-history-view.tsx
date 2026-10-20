'use client';

import type { ReactNode } from 'react';
import type { BookingRecord } from '../model/booking';
import { bookingTime, formatVnd } from '../model/booking-time';
import type { PaymentScreen } from '../../payment/model/payment';
import type { RefundTrackerItem } from '../../payment/api/payment-contract';
import type {
  PaymentHistoryResource,
  PaymentHistoryResources,
  ResourceState,
} from '../hooks/use-booking-payment-history';

const SCREEN_LABELS: Record<PaymentScreen, string> = {
  SCR04_SUCCESS: 'Đã thanh toán đủ',
  SCR05_EXPIRED: 'Yêu cầu đã hết hạn',
  SCR06_REVIEW: 'Đang chờ kiểm tra',
  SCR_PENDING: 'Đang chờ thanh toán',
  SCR_CANCELLED: 'Đã hủy',
};

const RESOURCE_LABELS: Record<PaymentHistoryResource, string> = {
  PREPAYMENT: 'Thanh toán trước',
  BALANCE: 'Số dư còn lại',
  REFUNDS: 'Hoàn tiền',
};

const EMPTY_LABELS: Record<PaymentHistoryResource, string> = {
  PREPAYMENT: 'Chưa có yêu cầu thanh toán trước.',
  BALANCE: 'Chưa có yêu cầu thanh toán số dư.',
  REFUNDS: 'Chưa có yêu cầu hoàn tiền.',
};

export interface PaymentHistoryViewProps {
  bookings: BookingRecord[];
  bookingId: string | null;
  resources: PaymentHistoryResources;
  refreshing: boolean;
  cooldownUntil: number;
  updatedAt: number | null;
  onToggle: (bookingId: string) => void;
  onRefresh: () => void;
  onRetry: (resource: PaymentHistoryResource) => void;
}

export function PaymentHistoryView({
  bookings,
  bookingId,
  resources,
  refreshing,
  cooldownUntil,
  updatedAt,
  onToggle,
  onRefresh,
  onRetry,
}: PaymentHistoryViewProps) {
  const anyLoading =
    resources.PREPAYMENT.status === 'loading' ||
    resources.BALANCE.status === 'loading' ||
    resources.REFUNDS.status === 'loading';
  const coolingDown = cooldownUntil > Date.now();

  return (
    <section className="payment-history" aria-labelledby="payment-history-heading">
      <h2 id="payment-history-heading">Hóa đơn & thanh toán</h2>
      <p>
        Xem yêu cầu thanh toán theo từng booking. Hệ thống chưa hỗ trợ hóa đơn
        điện tử.
      </p>
      {bookings.length === 0 ? (
        <p>Chưa có lịch sử đặt sân.</p>
      ) : (
        <div className="booking-list">
          {bookings.map((booking) => {
            const expanded = bookingId === booking.id;
            const regionId = `payment-history-${booking.id}`;
            return (
              <article className="booking-panel" key={booking.id}>
                <h3>
                  {booking.courtName} · {booking.bookingCode}
                </h3>
                <p>
                  {bookingTime(booking.startsAt, booking.timezone)} →{' '}
                  {bookingTime(booking.endsAt, booking.timezone)} (
                  {booking.timezone})
                </p>
                <p>Tổng tiền sân: {formatVnd(booking.totalAmount)}</p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  aria-expanded={expanded}
                  aria-controls={regionId}
                  onClick={() => onToggle(booking.id)}
                >
                  {expanded ? 'Ẩn yêu cầu thanh toán' : 'Xem yêu cầu thanh toán'}
                </button>
                {expanded && (
                  <div
                    id={regionId}
                    className="payment-history-detail"
                    role="region"
                    aria-label={`Yêu cầu thanh toán của ${booking.bookingCode}`}
                  >
                    <div className="payment-history-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={refreshing || anyLoading || coolingDown}
                        onClick={onRefresh}
                      >
                        {refreshing ? 'Đang cập nhật…' : 'Cập nhật thanh toán'}
                      </button>
                      {updatedAt ? (
                        <span>
                          Cập nhật lúc{' '}
                          {new Date(updatedAt).toLocaleTimeString('vi-VN')}
                        </span>
                      ) : null}
                      {coolingDown ? (
                        <span>Vui lòng chờ trước khi cập nhật tiếp.</span>
                      ) : null}
                    </div>
                    <ResourcePanel
                      resource="PREPAYMENT"
                      state={resources.PREPAYMENT}
                      onRetry={onRetry}
                    />
                    <ResourcePanel
                      resource="BALANCE"
                      state={resources.BALANCE}
                      onRetry={onRetry}
                    />
                    <RefundPanel state={resources.REFUNDS} onRetry={onRetry} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ResourcePanel({
  resource,
  state,
  onRetry,
}: {
  resource: 'PREPAYMENT' | 'BALANCE';
  state: ResourceState<{
    screen: PaymentScreen;
    reviewRequired: boolean;
    bookingStatus: string;
    netCredited: number;
    requiredPrepaymentAmount: number;
  }>;
  onRetry: (resource: PaymentHistoryResource) => void;
}) {
  return (
    <section aria-label={RESOURCE_LABELS[resource]}>
      <h4>{RESOURCE_LABELS[resource]}</h4>
      <ResourceStatus
        state={state}
        emptyLabel={EMPTY_LABELS[resource]}
        onRetry={() => onRetry(resource)}
      >
        {(outcome) => (
          <>
            <p>{SCREEN_LABELS[outcome.screen]}</p>
            <p>Đã ghi nhận: {formatVnd(outcome.netCredited)}</p>
            <p>
              Cần thanh toán trước: {formatVnd(outcome.requiredPrepaymentAmount)}
            </p>
            <p>Trạng thái booking: {outcome.bookingStatus}</p>
            {outcome.reviewRequired ? (
              <p>Yêu cầu đang được kiểm tra thủ công.</p>
            ) : null}
          </>
        )}
      </ResourceStatus>
    </section>
  );
}

function RefundPanel({
  state,
  onRetry,
}: {
  state: ResourceState<RefundTrackerItem[]>;
  onRetry: (resource: PaymentHistoryResource) => void;
}) {
  return (
    <section aria-label={RESOURCE_LABELS.REFUNDS}>
      <h4>{RESOURCE_LABELS.REFUNDS}</h4>
      <ResourceStatus
        state={state}
        emptyLabel={EMPTY_LABELS.REFUNDS}
        onRetry={() => onRetry('REFUNDS')}
      >
        {(items) =>
          items.length === 0 ? (
            <p>{EMPTY_LABELS.REFUNDS}</p>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <p>
                    {REFUND_STATUS_LABELS[item.outcomeCode]} ·{' '}
                    {formatVnd(item.amount)}
                  </p>
                  {item.actionRequired ? <p>{item.actionRequired}</p> : null}
                  {item.destinationAccountLast4 ? (
                    <p>Tài khoản nhận: ••••{item.destinationAccountLast4}</p>
                  ) : null}
                  {item.bankTransactionReference ? (
                    <p>Mã giao dịch: {item.bankTransactionReference}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        }
      </ResourceStatus>
    </section>
  );
}

const REFUND_STATUS_LABELS: Record<RefundTrackerItem['outcomeCode'], string> = {
  COMPLETED: 'Đã hoàn tất',
  REJECTED: 'Bị từ chối',
  CANCELLED: 'Đã hủy',
  UNKNOWN: 'Chưa xác định',
  FAILED: 'Thất bại',
  PROCESSING: 'Đang xử lý',
};

function ResourceStatus<T>({
  state,
  emptyLabel,
  onRetry,
  children,
}: {
  state: ResourceState<T>;
  emptyLabel: string;
  onRetry: () => void;
  children: (data: T) => ReactNode;
}) {
  if (state.status === 'loading')
    return <p role="status">Đang tải trạng thái…</p>;
  if (state.status === 'error')
    return (
      <div>
        <p role="alert">Chưa tải được trạng thái. {state.error}</p>
        {state.retryAfterMs ? (
          <p>
            Có thể thử lại sau {Math.ceil(state.retryAfterMs / 1000)} giây.
          </p>
        ) : null}
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Thử lại
        </button>
      </div>
    );
  if (state.data === null || state.data === undefined)
    return <p>{emptyLabel}</p>;
  return <>{children(state.data)}</>;
}
