import type { Metadata } from 'next';
import { BookingScreen } from './booking-screen';
import '../../../public/booking-live.css';

export const metadata: Metadata = {
  title: 'Giữ sân 5 phút — SMASH ARENA',
  description: 'Kiểm tra lịch, báo giá và giữ sân Pickleball từ hệ thống.',
};

function validIso(value: unknown): value is string {
  return (
    typeof value === 'string' && Number.isFinite(Date.parse(value as string))
  );
}

export default async function CourtPage({
  params,
  searchParams,
}: {
  params: Promise<{ courtId: string }>;
  searchParams: Promise<{
    startsAt?: string | string[];
    endsAt?: string | string[];
  }>;
}) {
  const { courtId } = await params;
  const query = await searchParams;
  const startsAt = Array.isArray(query.startsAt)
    ? query.startsAt[0]
    : query.startsAt;
  const endsAt = Array.isArray(query.endsAt) ? query.endsAt[0] : query.endsAt;
  const preselectedWindow =
    validIso(startsAt) &&
    validIso(endsAt) &&
    Date.parse(endsAt) > Date.parse(startsAt)
      ? { startsAt, endsAt }
      : undefined;
  return (
    <BookingScreen courtId={courtId} preselectedWindow={preselectedWindow} />
  );
}
