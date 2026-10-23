'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import {
  bookingTime,
  BOOKING_STATUS_LABELS,
  formatVnd,
} from '../model/booking-time';
import type { BookingRecord } from '../model/booking';
import { ArenaIcon } from '../../../components/arena/arena-icon';
import { ArenaDialog } from '../../../components/arena/arena-dialog';
import { ArenaLocationButton } from '../../../components/arena/arena-location';

type TicketProps = {
  booking: BookingRecord;
  pendingId: string;
  onCancel: (id: string) => void;
};

function TicketDetails({ booking }: Pick<TicketProps, 'booking'>) {
  return (
    <>
      <div className="arena-ticket-top">
        <span className="arena-ticket-status" data-status={booking.status}>
          {BOOKING_STATUS_LABELS[booking.status]}
        </span>
        <span className="arena-ticket-code">#{booking.bookingCode}</span>
      </div>
      <h2>{booking.courtName}</h2>
      <TicketSchedule booking={booking} />
      <p className="arena-ticket-timezone">Giờ theo {booking.timezone}</p>
      <TicketServices booking={booking} />
      <p className="arena-ticket-total">
        Tổng đơn: <strong>{formatVnd(booking.totalAmount)}</strong>
      </p>
    </>
  );
}

function TicketSchedule({ booking }: Pick<TicketProps, 'booking'>) {
  return (
    <div className="arena-ticket-fields">
      <div>
        <span>Bắt đầu</span>
        <strong>{bookingTime(booking.startsAt, booking.timezone)}</strong>
      </div>
      <div>
        <span>Kết thúc</span>
        <strong>{bookingTime(booking.endsAt, booking.timezone)}</strong>
      </div>
    </div>
  );
}

function TicketServices({ booking }: Pick<TicketProps, 'booking'>) {
  if (!booking.serviceItems?.length) return null;
  return (
    <ul className="arena-ticket-services">
      {booking.serviceItems.map((item) => (
        <li key={item.productId}>
          {item.name} × {item.quantity}
          {item.billingMode === 'HOURLY_RENTAL'
            ? ` · ${item.durationMinutes} phút`
            : ''}
          : {formatVnd(item.amount)}
        </li>
      ))}
    </ul>
  );
}

function TicketPass({ booking }: Pick<TicketProps, 'booking'>) {
  return (
    <div className="arena-ticket-pass">
      <div className="arena-ticket-stub">
        <ArenaIcon name="ticket" width="56" height="56" />
      </div>
      <span>MÃ ĐẶT SÂN</span>
      <strong>{booking.bookingCode}</strong>
      <small>
        QR/PIN check-in chưa được hệ thống cung cấp. Mã đặt sân không phải mã QR
        thanh toán.
      </small>
    </div>
  );
}

function CancelHold({ booking, pendingId, onCancel }: TicketProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (booking.status !== 'HOLDING') return null;
  return (
    <>
      <button
        type="button"
        className="arena-button arena-button-danger"
        disabled={Boolean(pendingId)}
        onClick={() => setOpen(true)}
      >
        {pendingId === booking.id ? 'Đang hủy…' : 'Hủy giữ chỗ'}
      </button>
      {open && (
        <CancelConfirmation
          booking={booking}
          onClose={close}
          onConfirm={() => {
            close();
            onCancel(booking.id);
          }}
        />
      )}
    </>
  );
}

function CancelConfirmation({
  booking,
  onClose,
  onConfirm,
}: {
  booking: BookingRecord;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ArenaDialog title="Xác nhận hủy giữ chỗ?" onClose={onClose}>
      <p>
        Mã đặt sân: <strong>{booking.bookingCode}</strong>
      </p>
      <p>
        Bạn đang hủy lượt giữ chỗ chưa thanh toán. Kết quả sẽ được xác nhận từ
        máy chủ.
      </p>
      <div className="arena-dialog-actions">
        <button type="button" className="arena-button" onClick={onClose}>
          Giữ lại lượt đặt
        </button>
        <button
          type="button"
          className="arena-button arena-button-danger"
          onClick={onConfirm}
        >
          Đồng ý hủy
        </button>
      </div>
    </ArenaDialog>
  );
}

export function BookingTicket(props: TicketProps) {
  return (
    <article className="arena-ticket">
      <div className="arena-ticket-main">
        <TicketDetails booking={props.booking} />
        {props.booking.status === 'HOLDING' && (
          <p className="arena-ticket-expiry">
            Hạn giữ chỗ:{' '}
            {bookingTime(props.booking.holdExpiresAt, props.booking.timezone)}
          </p>
        )}
        <div className="arena-ticket-actions">
          <Link className="arena-button" href="/bookings?tab=payments">
            <ArenaIcon name="receipt" />
            Hóa đơn & thanh toán
          </Link>
          <ArenaLocationButton />
          <CancelHold {...props} />
        </div>
      </div>
      <TicketPass booking={props.booking} />
    </article>
  );
}
