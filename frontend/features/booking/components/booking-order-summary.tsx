'use client';

import { BookingFeedback } from './live-booking-view';
import { BookingPaymentCheckout } from '../../payment/components/payment-status-panel';
import type { LiveBookingViewProps } from './live-booking-view';
import {
  formatVnd,
  formatBookingDate,
  isWindowInPast,
} from '../model/booking-time';
import type {
  ServiceProduct,
  ServiceSelection,
  BookingServiceLine,
} from '../model/booking';
import { ArenaIcon } from '../../../components/arena/arena-icon';
import { TransactionTerms } from '../../legal/components/transaction-terms';
import { useState } from 'react';

function CouponField() {
  return (
    <div className="arena-coupon">
      <label htmlFor="arena-coupon">Mã ưu đãi</label>
      <div>
        <input
          id="arena-coupon"
          placeholder="Nhập mã coupon..."
          disabled
          aria-describedby="arena-coupon-note"
        />
        <button type="button" className="arena-button" disabled>
          Áp dụng
        </button>
      </div>
      <small id="arena-coupon-note">
        Hệ thống chưa hỗ trợ áp dụng mã ưu đãi.
      </small>
    </div>
  );
}

function SelectedSchedule({ state }: Pick<LiveBookingViewProps, 'state'>) {
  const startTime = state.window.start.slice(11);
  const endTime = state.window.end.slice(11);
  return (
    <div className="order-section">
      <h3>Lịch chơi</h3>
      <p>{formatBookingDate(state.window.start) || 'Chưa chọn ngày'}</p>
      <strong>
        {startTime && endTime
          ? `${startTime} – ${endTime}`
          : 'Chưa chọn khung giờ'}
      </strong>
      <a href="#booking-slots">Chỉnh sửa lịch</a>
    </div>
  );
}

export function calculateEstimatedPrices({
  start,
  end,
  pricePerHour,
  services,
  products,
}: {
  start?: string;
  end?: string;
  pricePerHour?: number;
  services?: ServiceSelection[];
  products?: ServiceProduct[];
}) {
  if (!start || !end || !pricePerHour || pricePerHour <= 0) {
    return null;
  }
  const startTime = start.slice(11);
  const endTime = end.slice(11);
  if (!startTime || !endTime || startTime >= endTime) {
    return null;
  }
  const startDate = new Date(start);
  const endDate = new Date(end);
  const durationMs = endDate.getTime() - startDate.getTime();
  if (durationMs <= 0 || isNaN(durationMs)) {
    return null;
  }
  const durationHours = durationMs / (1000 * 60 * 60);
  const courtTotal = Math.round(durationHours * pricePerHour);

  let servicesTotal = 0;
  if (services && services.length > 0 && products) {
    for (const item of services) {
      const prod = products.find((p) => p.id === item.productId);
      if (prod) {
        if (prod.billingMode === 'HOURLY_RENTAL') {
          servicesTotal += Math.round(
            prod.unitPrice * durationHours * item.quantity,
          );
        } else {
          servicesTotal += Math.round(prod.unitPrice * item.quantity);
        }
      }
    }
  }

  const total = courtTotal + servicesTotal;
  const deposit = Math.floor((total * 30 + 50) / 100);
  const remaining = total - deposit;

  return {
    courtTotal,
    servicesTotal,
    total,
    deposit,
    remaining,
  };
}

function HoldButton(
  props: LiveBookingViewProps & {
    pricePerHour?: number;
    onGuestBook?: () => void;
  },
) {
  const { state, authenticated, onGuestBook, timezone } = props;
  const isPast = isWindowInPast(state.window, timezone);
  const hasTime = Boolean(
    state.window.start.slice(11) && state.window.end.slice(11),
  );
  const isAvailable = state.quote
    ? Boolean(state.quote.available)
    : hasTime && !isPast;
  // Window-level conflict or grid failure locks NEW submits, but the
  // idempotent "retry request" action stays available per replay contract.
  const gridBlocked = props.gridConflict === true || props.gridLocked === true;
  const isDisabled =
    !isAvailable || gridBlocked || Boolean(state.booking) || isPast || !hasTime;

  return (
    <button
      type={authenticated ? 'submit' : 'button'}
      className="btn btn-primary"
      disabled={isDisabled}
      onClick={!authenticated ? onGuestBook : undefined}
      aria-label="Đặt sân (đặt cọc 30%)"
    >
      {state.busy
        ? 'Đang kiểm tra...'
        : isPast
          ? 'Khung giờ đã qua'
          : !hasTime
            ? 'Vui lòng chọn giờ'
            : gridBlocked
              ? 'Khung giờ đang bị trùng — chọn lại'
              : 'Đặt sân'}
    </button>
  );
}

function BookingCheckout(
  props: LiveBookingViewProps & {
    pricePerHour?: number;
    onGuestBook?: () => void;
  },
) {
  const [termsAccepted, setTermsAccepted] = useState(false);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (props.authenticated) {
          if (!termsAccepted) return;
          props.onCreate();
        } else {
          props.onGuestBook?.();
        }
      }}
    >
      {props.authenticated && (
        <TransactionTerms
          accepted={termsAccepted}
          onAcceptanceChange={setTermsAccepted}
          disabled={props.state.busy}
        />
      )}
      <fieldset
        disabled={props.state.busy || (props.authenticated && !termsAccepted)}
      >
        <HoldButton {...props} />
      </fieldset>
      {props.showSignIn && (
        <div
          style={{
            marginTop: '0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.375rem',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: '0.8125rem',
              color: 'var(--text-secondary, #94a3b8)',
              textAlign: 'center',
            }}
          >
            hoặc đăng nhập nếu bạn đã có tài khoản
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={props.onSignIn}
          >
            {props.signInLabel}
          </button>
        </div>
      )}
    </form>
  );
}

function PricedServices({ lines }: { lines: BookingServiceLine[] }) {
  return (
    <ul className="order-services">
      {lines.map((line) => (
        <li key={line.productId}>
          <span>
            {line.name} × {line.quantity}
            {line.billingMode === 'HOURLY_RENTAL'
              ? ` · ${line.durationMinutes} phút`
              : ''}
          </span>
          <strong>{formatVnd(line.amount)}</strong>
        </li>
      ))}
    </ul>
  );
}

function SelectedServices({
  selected,
  products,
}: {
  selected: ServiceSelection[];
  products: ServiceProduct[];
}) {
  if (!selected.length) return <p>Chưa chọn dịch vụ.</p>;
  return (
    <ul className="order-services">
      {selected.map((item) => (
        <li key={item.productId}>
          {products.find((product) => product.id === item.productId)?.name ??
            'Dịch vụ'}{' '}
          × {item.quantity}
        </li>
      ))}
    </ul>
  );
}

function OrderExtras({
  state,
  products,
}: Pick<LiveBookingViewProps, 'state'> & { products: ServiceProduct[] }) {
  const lines = state.booking?.serviceItems ?? state.quote?.serviceItems;
  return (
    <div className="order-section">
      <h3>Dịch vụ đi kèm</h3>
      {lines?.length ? (
        <PricedServices lines={lines} />
      ) : (
        <SelectedServices selected={state.services ?? []} products={products} />
      )}
      <a href="#court-services">Chỉnh sửa dịch vụ</a>
    </div>
  );
}

function OrderCourtPrice({
  state,
  pricePerHour,
}: Pick<LiveBookingViewProps, 'state'> & { pricePerHour?: number }) {
  const price = state.booking ?? state.quote;
  const estimated = calculateEstimatedPrices({
    start: state.window.start,
    end: state.window.end,
    pricePerHour,
    services: state.services,
  });
  const courtTotal = price
    ? price.priceItems.reduce((sum, item) => sum + item.amount, 0)
    : estimated?.courtTotal;
  const deposit =
    courtTotal !== undefined
      ? Math.floor((courtTotal * 30 + 50) / 100)
      : undefined;
  const remaining =
    courtTotal !== undefined && deposit !== undefined
      ? courtTotal - deposit
      : undefined;

  return (
    <div className="order-section">
      <div className="order-price-row">
        <span>Tiền thuê sân</span>
        <strong>
          {courtTotal !== undefined ? formatVnd(courtTotal) : '—'}
        </strong>
      </div>
      <div
        className="order-price-row"
        style={{ color: 'var(--accent-volt, #a3e635)', fontWeight: 600 }}
      >
        <span>Đặt cọc bắt buộc (30%)</span>
        <strong>{deposit !== undefined ? formatVnd(deposit) : '—'}</strong>
      </div>
      <div
        className="order-price-row"
        style={{
          color: 'var(--text-secondary, #94a3b8)',
          fontSize: '0.875rem',
        }}
      >
        <span>Còn lại tại sân (70%)</span>
        <strong>{remaining !== undefined ? formatVnd(remaining) : '—'}</strong>
      </div>
    </div>
  );
}

function OrderTotal({
  state,
  pricePerHour,
  products,
}: Pick<LiveBookingViewProps, 'state'> & {
  pricePerHour?: number;
  products?: ServiceProduct[];
}) {
  const estimated = calculateEstimatedPrices({
    start: state.window.start,
    end: state.window.end,
    pricePerHour,
    services: state.services,
    products,
  });
  const total =
    state.booking?.totalAmount ??
    (state.quote?.available ? state.quote.totalAmount : estimated?.total);
  const requiredDeposit = state.booking
    ? Number(
        state.booking.requiredPrepaymentAmount ??
          (total !== undefined ? Math.floor((total * 30 + 50) / 100) : 0),
      )
    : total !== undefined
      ? Math.floor((total * 30 + 50) / 100)
      : undefined;

  return (
    <>
      <div className="order-total" aria-live="polite">
        <span>Tổng tiền thanh toán</span>
        <strong>{total === undefined ? '—' : formatVnd(total)}</strong>
      </div>
      <div
        className="order-price-row"
        style={{ color: 'var(--accent-volt, #a3e635)', fontWeight: 600 }}
      >
        <span>Tiền cọc cần thanh toán (30%)</span>
        <strong>
          {requiredDeposit === undefined ? '—' : formatVnd(requiredDeposit)}
        </strong>
      </div>
      {total === undefined && (
        <p className="detail-muted">Chọn khung giờ trên lịch để xem giá.</p>
      )}
    </>
  );
}

export function BookingOrderSummary(
  props: LiveBookingViewProps & {
    courtName: string;
    courtCode: string;
    products: ServiceProduct[];
    pricePerHour?: number;
    onGuestBook?: () => void;
  },
) {
  return (
    <aside
      className="booking-panel detail-order"
      id="order-summary"
      aria-labelledby="order-heading"
    >
      <div className="detail-section-heading">
        <h2 id="order-heading">
          <ArenaIcon name="receipt" />
          Tóm tắt thanh toán
        </h2>
        <span>{props.courtCode}</span>
      </div>
      <p className="order-court-name">{props.courtName}</p>
      <SelectedSchedule state={props.state} />
      <OrderCourtPrice state={props.state} pricePerHour={props.pricePerHour} />
      <OrderExtras state={props.state} products={props.products} />
      <CouponField />
      <OrderTotal
        state={props.state}
        pricePerHour={props.pricePerHour}
        products={props.products}
      />
      <OrderFeedback {...props} />
      <OrderPayment {...props} />
    </aside>
  );
}

function OrderFeedback(props: LiveBookingViewProps) {
  return (
    <BookingFeedback
      state={{
        ...props.state,
        quote:
          props.state.quote?.available === false
            ? props.state.quote
            : undefined,
        booking: undefined,
      }}
      authenticated={props.authenticated}
      onCreate={props.onCreate}
    />
  );
}

function OrderPayment(
  props: LiveBookingViewProps & {
    pricePerHour?: number;
    onGuestBook?: () => void;
  },
) {
  return props.state.booking ? (
    <BookingPaymentCheckout
      key={props.state.booking.id}
      booking={props.state.booking}
      onReset={() => props.onChangeWindow(props.state.window)}
    />
  ) : (
    <BookingCheckout {...props} />
  );
}
