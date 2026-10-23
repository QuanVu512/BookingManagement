import Link from 'next/link';
import { ArenaShell } from '../../components/arena/arena-shell';
import { ArenaIcon } from '../../components/arena/arena-icon';
import { MyBookingsPanel } from '../../features/booking/components/my-bookings-panel';
import '../../public/booking-live.css';

export default async function MyBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const requestedTab = (await searchParams).tab;
  const tab = requestedTab === 'payments' ? 'payments' : 'bookings';
  return (
    <ArenaShell page="bookings">
      <main className="arena-main arena-tickets-page booking-live">
        <BookingsHeading />
        <BookingsTabs tab={tab} />
        <MyBookingsPanel initialTab={tab} />
      </main>
    </ArenaShell>
  );
}

function BookingsHeading() {
  return (
    <div className="arena-page-heading arena-ticket-heading">
      <div>
        <p className="arena-eyebrow">
          <ArenaIcon name="ticket" />
          Lịch thi đấu cá nhân
        </p>
        <h1>LỊCH CỦA TÔI</h1>
        <p>Trạng thái đặt sân được cập nhật tự động từ máy chủ.</p>
      </div>
      <Link href="/booking" className="arena-button arena-button-neon">
        <ArenaIcon name="plus" />
        Đặt thêm trận mới
      </Link>
    </div>
  );
}

function BookingsTabs({ tab }: { tab: 'bookings' | 'payments' }) {
  return (
    <nav className="arena-history-tabs" aria-label="Khu vực lịch sử đặt sân">
      <Link
        href="/bookings"
        aria-current={tab === 'bookings' ? 'page' : undefined}
      >
        Lịch sử đặt sân
      </Link>
      <Link
        href="/bookings?tab=payments"
        aria-current={tab === 'payments' ? 'page' : undefined}
      >
        Hóa đơn & thanh toán
      </Link>
    </nav>
  );
}
