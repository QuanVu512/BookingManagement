/** @deprecated Legacy static court-detail mockup. Not part of the live route; use frontend/features/courts instead. */
import type { CourtBookingProps } from '../../types/court-booking';
import { BOOKING_CONFIG } from '../../lib/court-booking';
import { SportyHeader } from '../home/sporty-header';
import { CourtGallery } from './court-gallery';
import { CourtTimeSlotPicker } from './court-time-slot-picker';
import { CourtAddonsList } from './court-addons-list';
import { OrderSummarySidebar } from './order-summary-sidebar';

function CourtBreadcrumb({ courtName }: { courtName: string }) {
  return (
    <nav className="cb-breadcrumb" aria-label="Đường dẫn trang">
      <a href="/">Trang chủ</a>
      <span>/</span>
      <a href="/#courts-catalog">Sân Pickleball Hà Nội</a>
      <span>/</span>
      <strong>{courtName}</strong>
    </nav>
  );
}

function CourtContent(props: CourtBookingProps) {
  return (
    <div className="cb-main-column">
      <CourtGallery court={props.court} />
      <CourtTimeSlotPicker
        court={props.court}
        date={props.selection.date}
        selectedIds={props.selection.slotIds}
        onDateChange={props.onDateChange}
        onSlotToggle={props.onSlotToggle}
      />
      <CourtAddonsList
        quantities={props.selection.quantities}
        onQuantityChange={props.onQuantityChange}
      />
    </div>
  );
}

function ClubFooter() {
  return (
    <footer className="cb-footer">
      <strong>
        {BOOKING_CONFIG.brand} — {BOOKING_CONFIG.club}
      </strong>
      <p>{BOOKING_CONFIG.address}</p>
      <a href="/#courts-catalog">Khám phá các sân khác</a>
    </footer>
  );
}

export function CourtBookingLayout(props: CourtBookingProps) {
  return (
    <div className="court-booking-page">
      <SportyHeader currentPage="court-detail" />
      <main className="cb-container">
        <CourtBreadcrumb courtName={props.court.name} />
        <div className="cb-layout">
          <CourtContent {...props} />
          <OrderSummarySidebar {...props} />
        </div>
      </main>
      <ClubFooter />
    </div>
  );
}
