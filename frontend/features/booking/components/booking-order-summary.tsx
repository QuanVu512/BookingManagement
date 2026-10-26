'use client';

import { BookingFeedback } from './live-booking-view';
import { BookingPaymentCheckout } from '../../payment/components/payment-status-panel';
import type { LiveBookingViewProps } from './live-booking-view';
import { formatVnd, formatBookingDate } from '../model/booking-time';
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
  return (
    <div className="order-section">
      <h3>Lịch chơi</h3>
      <p>{formatBookingDate(state.window.start) || 'Chưa chọn ngày'}</p>
      <strong>
        {state.window.start.slice(11) || '—'} –{' '}
        {state.window.end.slice(11) || '—'}
      </strong>
      <a href="#booking-slots">Chỉnh sửa lịch</a>
    </div>
  );
}

function HoldButton({ state, authenticated }: LiveBookingViewProps) {
  return (
    <button
      type="submit"
      className="btn btn-primary"
      disabled={
        !authenticated || !state.quote?.available || Boolean(state.booking)
      }
      aria-label="Giữ chỗ 5 phút & Thanh toán cọc 30%"
    >
      {state.busy ? 'Đang giữ chỗ…' : 'Giữ chỗ 5 phút & Thanh toán cọc 30%'}
    </button>
  );
}

function BookingCheckout(props: LiveBookingViewProps) {
  const [termsAccepted, setTermsAccepted] = useState(false);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!termsAccepted) return;
        props.onCreate();
      }}
    >
      <TransactionTerms
        accepted={termsAccepted}
        onAcceptanceChange={setTermsAccepted}
        disabled={props.state.busy}
      />
      <fieldset disabled={props.state.busy || !termsAccepted}>
        <HoldButton {...props} />
      </fieldset>
      {props.showSignIn && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={props.onSignIn}
        >
          {props.signInLabel}
        </button>
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

function OrderCourtPrice({ state }: Pick<LiveBookingViewProps, 'state'>) {
  const price = state.booking ?? state.quote;
  const courtTotal = price
    ? price.priceItems.reduce((sum, item) => sum + item.amount, 0)
    : undefined;
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
        <strong>{courtTotal !== undefined ? formatVnd(courtTotal) : '—'}</strong>
      </div>
      <div className="order-price-row" style={{ color: 'var(--accent-volt, #a3e635)', fontWeight: 600 }}>
        <span>Đặt cọc bắt buộc (30%)</span>
        <strong>{deposit !== undefined ? formatVnd(deposit) : '—'}</strong>
      </div>
      <div className="order-price-row" style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.875rem' }}>
        <span>Còn lại tại sân (70%)</span>
        <strong>{remaining !== undefined ? formatVnd(remaining) : '—'}</strong>
      </div>
    </div>
  );
}

function OrderTotal({ state }: Pick<LiveBookingViewProps, 'state'>) {
  const price = state.booking ?? state.quote;
  const courtTotal = price
    ? price.priceItems.reduce((sum, item) => sum + item.amount, 0)
    : undefined;
  const requiredDeposit =
    state.booking
      ? Number(state.booking.requiredPrepaymentAmount ?? (courtTotal !== undefined ? Math.floor((courtTotal * 30 + 50) / 100) : 0))
      : (courtTotal !== undefined ? Math.floor((courtTotal * 30 + 50) / 100) : undefined);

  return (
    <>
      <div className="order-total" aria-live="polite">
        <span>Tiền cọc cần thanh toán (30%)</span>
        <strong>{requiredDeposit === undefined ? '—' : formatVnd(requiredDeposit)}</strong>
      </div>
      {requiredDeposit === undefined && (
        <p className="detail-muted">
          Kiểm tra lại giá sau khi đổi lịch hoặc dịch vụ.
        </p>
      )}
    </>
  );
}

export function BookingOrderSummary(
  props: LiveBookingViewProps & {
    courtName: string;
    courtCode: string;
    products: ServiceProduct[];
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
      <OrderCourtPrice state={props.state} />
      <OrderExtras state={props.state} products={props.products} />
      <CouponField />
      <OrderTotal state={props.state} />
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

function OrderPayment(props: LiveBookingViewProps) {
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
