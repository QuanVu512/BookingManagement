import type { Metadata } from 'next';
import { CourtDetailPage } from '../../../components/court-detail/court-detail-page';
import '../../../public/booking-live.css';

export const metadata: Metadata = {
  title: 'Giữ sân 5 phút — SMASH ARENA',
  description: 'Kiểm tra lịch, báo giá và giữ sân Pickleball từ hệ thống.',
};

export default async function CourtPage({
  params,
}: {
  params: Promise<{ courtId: string }>;
}) {
  const { courtId } = await params;
  return <CourtDetailPage courtId={courtId} />;
}
