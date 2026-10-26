import type { Metadata } from 'next';
import { LegalPageShell } from '../../features/legal/components/legal-page-shell';
import { SupportCaseForm } from '../../features/support/components/support-case-form';
import { SupportCaseStatusLookup } from '../../features/support/components/support-case-status';

export const metadata: Metadata = {
  title: 'Trung tâm Hỗ trợ & Tiếp nhận Khiếu nại | BookingManagement',
  description: 'Cổng hỗ trợ khách hàng, tiếp nhận phản ánh dịch vụ, khiếu nại thanh toán và giải quyết tranh chấp.',
};

export default function SupportPage() {
  return (
    <LegalPageShell activePath="/support">
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--ink, #f8fafc)' }}>
          Trung tâm Hỗ trợ & Giải quyết Khiếu nại
        </h1>
        <p style={{ color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.6, marginBottom: '2rem' }}>
          BookingManagement cam kết lắng nghe và giải quyết nhanh chóng mọi phản hồi của người dùng về dịch vụ sân thể thao, giao dịch thanh toán hoặc chính sách hoàn tiền.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2.5rem' }}>
          <section aria-labelledby="submit-form-heading">
            <h2 id="submit-form-heading" style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--ink, #f8fafc)' }}>
              Gửi yêu cầu hỗ trợ hoặc phản ánh dịch vụ
            </h2>
            <SupportCaseForm />
          </section>

          <section aria-labelledby="lookup-heading" style={{ borderTop: '1px solid var(--line, rgba(255, 255, 255, 0.08))', paddingTop: '1.5rem' }}>
            <SupportCaseStatusLookup />
          </section>
        </div>
      </div>
    </LegalPageShell>
  );
}
