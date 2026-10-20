import { redirect } from 'next/navigation';

export default function AccountPaymentsPage() {
  redirect('/bookings?tab=payments');
}
