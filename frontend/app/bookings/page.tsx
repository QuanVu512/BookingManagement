import Link from 'next/link';
import { SportyHeader } from '../../components/home/sporty-header';
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
    <>
      <SportyHeader currentPage="court-detail" />
      <main className="container booking-live">
        <Link href="/">← Danh sách sân</Link>
        <h1>Lịch sử đặt sân</h1>
        <p>Trạng thái đặt sân được cập nhật tự động từ máy chủ.</p>
        <nav className="booking-tabs" aria-label="Khu vực lịch sử đặt sân">
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
        <MyBookingsPanel initialTab={tab} />
      </main>
    </>
  );
}
