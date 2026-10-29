import type { Metadata } from 'next';
import { LegalPageShell } from '../../features/legal/components/legal-page-shell';
import { PolicyDocument } from '../../features/legal/components/policy-document';
import cookiesDocument from '../../content/legal/vi/cookies/v1.0.json';
import type { PolicyDocument as PolicyDocType } from '../../features/legal/model/policy-document';

export const metadata: Metadata = {
  title: 'Chính sách Cookie và Lưu trữ | SMASH ARENA PICKLEBALL',
  description: 'Chính sách sử dụng cookie, lưu trữ cục bộ và hướng dẫn quản lý quyền riêng tư trên SMASH ARENA.',
};

export default function CookiesPage() {
  return (
    <LegalPageShell activePath="/cookies">
      <PolicyDocument document={cookiesDocument as PolicyDocType} />
    </LegalPageShell>
  );
}
