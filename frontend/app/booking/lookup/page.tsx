import type { Metadata } from 'next';
import Link from 'next/link';
import { GuestLookupForm } from '../../../features/payment/components/guest-lookup-form';
import '../../../public/booking-live.css';

export const metadata: Metadata = {
  title: 'Tra cứu đơn giữ chỗ | SMASH ARENA',
};

export default function GuestLookupPage() {
  return (
    <main className="arena-main booking-live arena-booking-page">
      <section aria-labelledby="lookup-heading" className="arena-lookup-panel">
        <h1 id="lookup-heading">Tìm lại đơn giữ chỗ</h1>
        <p>
          Nhập số điện thoại hoặc email đã dùng khi đặt sân. Nếu còn đơn giữ
          chỗ chưa thanh toán, hệ thống sẽ gửi liên kết tiếp tục thanh toán
          tới email của chủ đơn.
        </p>
        <GuestLookupForm />
        <p>
          <Link href="/booking" className="arena-btn-secondary">
            Quay lại đặt sân
          </Link>
        </p>
      </section>
    </main>
  );
}
