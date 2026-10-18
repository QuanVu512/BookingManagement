/** @deprecated Legacy static court-detail mockup. Not part of the live route; use frontend/features/courts instead. */
import type { CourtBookingProps } from '../../types/court-booking';
import {
  BOOKING_CONFIG,
  formatMoney,
  formatBookingDate,
  getSlotPrice,
} from '../../lib/court-booking';
import { BookingIcon } from './booking-icon';
import { MotionValue } from './motion-value';

function OrderSchedule({ court, selection, order }: CourtBookingProps) {
  return (
    <div className="cb-order-schedule">
      <span>LỊCH THI ĐẤU</span>
      <strong data-summary-date>{formatBookingDate(selection.date)}</strong>
      <div data-summary-slots>
        {order.slots.length ? (
          order.slots.map((slot) => (
            <div className="cb-order-row" key={slot.id}>
              <span>
                {slot.start} – {slot.end}
              </span>
              <b>{formatMoney(getSlotPrice(court, slot))}</b>
            </div>
          ))
        ) : (
          <p>Chưa chọn khung giờ</p>
        )}
      </div>
    </div>
  );
}

function OrderAddons({ order }: CourtBookingProps) {
  return (
    <div className="cb-order-addons">
      <div className="cb-order-label">
        <h3>ĐỒ UỐNG & DỊCH VỤ ĐI KÈM</h3>
        <a href="#court-addons">Chỉnh sửa</a>
      </div>
      <div data-summary-addons>
        {order.lines.length ? (
          order.lines.map((line) => (
            <div className="cb-order-line" key={line.product.id}>
              <span className="cb-order-qty">{line.quantity}x</span>
              <span>{line.product.name}</span>
              <b>{formatMoney(line.total)}</b>
            </div>
          ))
        ) : (
          <p className="cb-empty">Chưa thêm đồ đi kèm.</p>
        )}
      </div>
    </div>
  );
}

function VoucherForm(props: CourtBookingProps) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        props.onVoucherApply();
      }}
      data-voucher-form
    >
      <input
        id="court-voucher"
        data-voucher-input
        value={props.selection.voucherInput}
        placeholder="Mã ưu đãi"
        onChange={(event) => props.onVoucherInput(event.target.value)}
        autoComplete="off"
      />
      <button type="submit">Áp dụng</button>
    </form>
  );
}

function OrderVoucher(props: CourtBookingProps) {
  const isApplied =
    props.selection.appliedVoucher === BOOKING_CONFIG.voucherCode;
  return (
    <div className="cb-voucher">
      <label htmlFor="court-voucher">Mã ưu đãi</label>
      <VoucherForm {...props} />
      <p
        data-voucher-message
        role="status"
        className={isApplied ? 'cb-message-success' : 'cb-message-error'}
      >
        {props.selection.voucherMessage}
      </p>
    </div>
  );
}

function OrderTotals({ order }: CourtBookingProps) {
  return (
    <div className="cb-order-totals" aria-live="polite" aria-atomic="true">
      <div className="cb-order-row">
        <span>Tiền thuê sân</span>
        <strong data-court-total>{formatMoney(order.courtTotal)}</strong>
      </div>
      <div className="cb-order-row">
        <span>Đồ uống & dịch vụ đi kèm</span>
        <strong data-addon-total>{formatMoney(order.addonTotal)}</strong>
      </div>
      <div className="cb-order-row cb-message-success">
        <span>Giảm giá tiền sân</span>
        <strong data-discount>−{formatMoney(order.discount)}</strong>
      </div>
      <div className="cb-order-row">
        <span>Phí dịch vụ & đèn LED</span>
        <strong className="cb-message-success">Miễn phí</strong>
      </div>
      <div className="cb-grand-total">
        <span>
          Tổng thanh toán<small>Giá minh họa cho đơn demo</small>
        </span>
        <strong data-order-total>
          <MotionValue value={formatMoney(order.total)} />
        </strong>
      </div>
    </div>
  );
}

function CheckoutTrust() {
  return (
    <div className="cb-trust">
      <span>
        <BookingIcon name="shield" />
        Giữ sân 100%*
      </span>
      <span>
        <BookingIcon name="check" />
        Xem đơn trước khi trả
      </span>
    </div>
  );
}

function CheckoutAction(props: CourtBookingProps) {
  return (
    <div className="cb-checkout">
      <button
        className="cb-checkout-button"
        type="button"
        data-checkout
        onClick={props.onCheckout}
        disabled={!props.order.slots.length || props.court.status !== 'ACTIVE'}
      >
        Tiến hành thanh toán
        <BookingIcon name="arrow" />
      </button>
      <p data-checkout-message role="status">
        {props.selection.checkoutMessage}
      </p>
      <CheckoutTrust />
      <small>
        *Cam kết minh họa. Bản demo chưa thu tiền hoặc giữ sân thực tế.
      </small>
    </div>
  );
}

export function OrderSummarySidebar(props: CourtBookingProps) {
  return (
    <aside
      className="cb-sidebar"
      id="order-summary"
      aria-labelledby="order-heading"
    >
      <div className="cb-panel cb-order-panel">
        <div className="cb-order-heading">
          <h2 id="order-heading">
            <BookingIcon name="bag" />
            Chi tiết đặt hàng
          </h2>
        </div>
        <OrderSchedule {...props} />
        <OrderAddons {...props} />
        <OrderVoucher {...props} />
        <OrderTotals {...props} />
        <CheckoutAction {...props} />
      </div>
    </aside>
  );
}
