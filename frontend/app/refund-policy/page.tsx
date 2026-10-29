import type { Metadata } from 'next';
import { LegalPageShell } from '../../features/legal/components/legal-page-shell';
import { PolicyDocument } from '../../features/legal/components/policy-document';
import refundPolicyDocument from '../../content/legal/vi/refund-policy/v1.0.json';
import type { PolicyDocument as PolicyDocType } from '../../features/legal/model/policy-document';

export const metadata: Metadata = {
  title: 'Chính sách hủy sân và hoàn tiền | SMASH ARENA PICKLEBALL',
  description: 'Chính sách hủy sân, tiền đặt cọc 30%, xử lý vắng mặt (No-Show) và các điều kiện hoàn tiền của SMASH ARENA PICKLEBALL.',
};

export default function RefundPolicyPage() {
  return (
    <LegalPageShell activePath="/refund-policy">
      <PolicyDocument document={refundPolicyDocument as PolicyDocType} />
    </LegalPageShell>
  );
}
