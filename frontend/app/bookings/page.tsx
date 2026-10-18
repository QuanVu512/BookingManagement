import Link from 'next/link';
import { SportyHeader } from '../../components/home/sporty-header';
import { AuthModal } from '../../components/auth/auth-modal';
import { MyBookingsPanel } from '../../features/booking/components/my-bookings-panel';
import '../../public/booking-live.css';

export default function MyBookingsPage() {
  return (
    <>
      <SportyHeader currentPage="court-detail" />
      <main className="container booking-live">
        <Link href="/">← Danh sách sân</Link>
        <h1>Booking của tôi</h1>
        <p>
          Trạng thái lấy từ máy chủ, cập nhật mỗi 15 giây. Giữ chỗ hết hạn sau 5
          phút; chưa có thanh toán.
        </p>
        <MyBookingsPanel />
      </main>
      <AuthModal />
    </>
  );
}
