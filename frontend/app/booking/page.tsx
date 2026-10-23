import type { Metadata } from 'next';
import { ArenaBookingPage } from '../../components/arena/arena-booking-page';
import '../../public/booking-live.css';

export const metadata: Metadata = { title: 'Đặt sân theo giờ | SMASH ARENA' };

export default function BookingPage() {
  return <ArenaBookingPage />;
}
