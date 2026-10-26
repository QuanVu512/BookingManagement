import type { Metadata } from 'next';
import { LegalPageShell } from '../../features/legal/components/legal-page-shell';
import { PolicyDocument } from '../../features/legal/components/policy-document';
import privacyDocument from '../../content/legal/vi/privacy/v1.0.json';
import type { PolicyDocument as PolicyDocType } from '../../features/legal/model/policy-document';

export const metadata: Metadata = {
  title: 'Chính sách quyền riêng tư | BookingManagement',
  description: 'Chính sách quyền riêng tư và bảo vệ dữ liệu cá nhân theo Nghị định 13/2023/NĐ-CP của hệ thống BookingManagement.',
};

export default function PrivacyPage() {
  return (
    <LegalPageShell activePath="/privacy">
      <PolicyDocument document={privacyDocument as PolicyDocType} />
    </LegalPageShell>
  );
}
