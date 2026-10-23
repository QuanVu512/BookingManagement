'use client';

import { useState } from 'react';
import type { BookingRecord } from '../model/booking';
import type { MyBookingsViewProps } from './my-bookings-view';
import { BookingTicket } from './booking-ticket';

type TicketFilter = 'upcoming' | 'history' | 'cancelled';
type TicketListProps = Pick<
  MyBookingsViewProps,
  'bookings' | 'pendingId' | 'onCancel' | 'nextCursor'
>;
const FILTERS: {
  id: TicketFilter;
  label: string;
  statuses: BookingRecord['status'][];
}[] = [
  {
    id: 'upcoming',
    label: 'Sắp diễn ra',
    statuses: ['HOLDING', 'CONFIRMED', 'CHECKED_IN'],
  },
  { id: 'history', label: 'Đã hoàn thành', statuses: ['COMPLETED', 'NO_SHOW'] },
  {
    id: 'cancelled',
    label: 'Đã hủy / Hết hạn',
    statuses: ['CANCELLED', 'EXPIRED'],
  },
];

export function BookingTicketList({
  bookings,
  pendingId,
  onCancel,
  nextCursor,
}: Pick<
  MyBookingsViewProps,
  'bookings' | 'pendingId' | 'onCancel' | 'nextCursor'
>) {
  const [filter, setFilter] = useState<TicketFilter>('upcoming');
  const active = FILTERS.find((item) => item.id === filter) ?? FILTERS[0];
  const visible = bookings.filter((booking) =>
    active.statuses.includes(booking.status),
  );
  return (
    <>
      <TicketFilters bookings={bookings} filter={filter} onChange={setFilter} />
      {nextCursor && (
        <p className="arena-muted">
          Số lượng tính trên các lượt đặt đã tải. Chọn “Xem thêm” để tải các
          lượt cũ hơn.
        </p>
      )}
      <TicketResults
        bookings={visible}
        pendingId={pendingId}
        onCancel={onCancel}
      />
    </>
  );
}

function TicketFilters({
  bookings,
  filter,
  onChange,
}: {
  bookings: BookingRecord[];
  filter: TicketFilter;
  onChange: (filter: TicketFilter) => void;
}) {
  return (
    <div
      className="arena-ticket-filters"
      role="group"
      aria-label="Lọc lịch đặt sân"
    >
      {FILTERS.map((item) => (
        <button
          type="button"
          key={item.id}
          aria-pressed={filter === item.id}
          onClick={() => onChange(item.id)}
        >
          {item.label} (
          {
            bookings.filter((booking) => item.statuses.includes(booking.status))
              .length
          }
          )
        </button>
      ))}
    </div>
  );
}

function TicketResults({
  bookings,
  pendingId,
  onCancel,
}: Omit<TicketListProps, 'nextCursor'>) {
  if (!bookings.length)
    return (
      <div className="arena-empty">
        <p>Không có lượt đặt sân nào trong mục này.</p>
        <a href="/booking" className="arena-button arena-button-neon">
          Đặt sân mới ngay
        </a>
      </div>
    );
  return (
    <div className="arena-ticket-list">
      {bookings.map((booking) => (
        <BookingTicket
          key={booking.id}
          booking={booking}
          pendingId={pendingId}
          onCancel={onCancel}
        />
      ))}
    </div>
  );
}
