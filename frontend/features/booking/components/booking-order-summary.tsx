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
    >
      {state.busy ? 'Đang xử lý…' : 'Đặt sân'}
    </button>
  );
}

function BookingCheckout(props: LiveBookingViewProps) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        props.onCreate();
      }}
    >
      <fieldset disabled={props.state.busy}>
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
  return (
    <div className="order-section order-price-row">
      <span>Tiền sân</span>
      <strong>
        {price
          ? formatVnd(
              price.priceItems.reduce((sum, item) => sum + item.amount, 0),
            )
          : '—'}
      </strong>
    </div>
  );
}

function OrderTotal({ state }: Pick<LiveBookingViewProps, 'state'>) {
  const total =
    state.booking?.totalAmount ??
    (state.quote?.available ? state.quote.totalAmount : undefined);
  return (
    <>
      <div className="order-total" aria-live="polite">
        <span>Tổng tiền thanh toán</span>
        <strong>{total === undefined ? '—' : formatVnd(total)}</strong>
      </div>
      {total === undefined && (
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
