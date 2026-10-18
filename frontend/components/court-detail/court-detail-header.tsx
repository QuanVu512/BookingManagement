/** @deprecated Legacy static court-detail mockup. Not part of the live route; use frontend/features/courts instead. */
import { BOOKING_CONFIG } from '../../lib/court-booking';
import { BookingIcon } from './booking-icon';

function ClubBrand() {
  return (
    <a className="cb-brand" href="/" aria-label="SMASH ARENA — Trang chủ">
      <span className="cb-brand-mark">
        <BookingIcon name="shield" />
      </span>
      <span>
        <strong>
          SMASH <em>ARENA</em>
        </strong>
        <small>{BOOKING_CONFIG.club}</small>
      </span>
    </a>
  );
}

function ClubNavigation() {
  return (
    <nav className="cb-nav" aria-label="Điều hướng chính">
      <a className="cb-nav-active" href="/#courts-catalog">
        Đặt sân
      </a>
      <a href="/#store-preview">Cửa hàng thể thao</a>
      <a href="/#facilities">Tiện ích</a>
    </nav>
  );
}

export function CourtDetailHeader({ itemCount }: { itemCount: number }) {
  return (
    <header className="cb-header">
      <div className="cb-announcement">
        Mở đặt sân thể thao Phù Đổng — Giữ chỗ tức thì, kiểm tra lịch trực tuyến
        linh hoạt
      </div>
      <div className="cb-header-inner">
        <ClubBrand />
        <a className="cb-search" href="/#courts-catalog">
          <BookingIcon name="search" />
          <span>Tìm sân đấu, dụng cụ, nước giải khát...</span>
          <b>Tìm kiếm</b>
        </a>
        <ClubNavigation />
        <a
          className="cb-cart"
          href="#order-summary"
          aria-label={`Đơn hàng: ${itemCount} mục`}
        >
          <BookingIcon name="bag" />
          <span data-cart-count>{itemCount}</span>
        </a>
      </div>
    </header>
  );
}
