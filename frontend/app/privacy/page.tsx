import type { Metadata } from 'next';
import { LegalPageShell } from '../../features/legal/components/legal-page-shell';
import { PolicyDocument } from '../../features/legal/components/policy-document';
import privacyDocument from '../../content/legal/vi/privacy/v1.0.json';
import type { PolicyDocument as PolicyDocType } from '../../features/legal/model/policy-document';

export const metadata: Metadata = {
  title: 'Chính sách quyền riêng tư | SMASH ARENA PICKLEBALL',
  description: 'Chính sách quyền riêng tư và bảo vệ dữ liệu cá nhân theo quy định của hệ thống SMASH ARENA PICKLEBALL.',
};

export default function PrivacyPage() {
  return (
    <LegalPageShell activePath="/privacy">
      <PolicyDocument document={privacyDocument as PolicyDocType} />
    </LegalPageShell>
  );
}
