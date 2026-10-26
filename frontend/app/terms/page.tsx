import type { Metadata } from 'next';
import { LegalPageShell } from '../../features/legal/components/legal-page-shell';
import { PolicyDocument } from '../../features/legal/components/policy-document';
import termsDocument from '../../content/legal/vi/terms/v1.0.json';
import type { PolicyDocument as PolicyDocType } from '../../features/legal/model/policy-document';

export const metadata: Metadata = {
  title: 'Điều khoản dịch vụ và giao kết đặt sân | BookingManagement',
  description: 'Điều khoản dịch vụ, quy tắc giữ chỗ 5 phút, thanh toán đặt cọc và nội quy sử dụng sân thể thao BookingManagement.',
};

export default function TermsPage() {
  return (
    <LegalPageShell activePath="/terms">
      <PolicyDocument document={termsDocument as PolicyDocType} />
    </LegalPageShell>
  );
}
