import type { Metadata } from 'next';
import { LegalPageShell } from '../../../features/legal/components/legal-page-shell';
import { PrivacyRequestForm } from '../../../features/privacy/components/privacy-request-form';

export const metadata: Metadata = {
  title: 'Yêu cầu quyền riêng tư | BookingManagement',
  description: 'Cổng tiếp nhận yêu cầu thực thi quyền của chủ thể dữ liệu cá nhân theo Nghị định 13/2023/NĐ-CP.',
};

export default function PrivacyRequestsPage() {
  return (
    <LegalPageShell activePath="/privacy">
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--ink, #f8fafc)' }}>
          Cổng tiếp nhận yêu cầu quyền riêng tư
        </h1>
        <p style={{ color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.6, marginBottom: '2rem' }}>
          Theo quy định tại Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân, bạn có quyền yêu cầu truy cập, sửa đổi, xóa bỏ hoặc hạn chế xử lý thông tin cá nhân của mình trên hệ thống BookingManagement. Vui lòng điền thông tin bên dưới để gửi yêu cầu.
        </p>

        <PrivacyRequestForm />
      </div>
    </LegalPageShell>
  );
}
