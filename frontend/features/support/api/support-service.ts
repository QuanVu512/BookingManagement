import type { SupportCaseCategory, SupportCaseItem } from '../model/support-case';

export async function submitSupportCase(input: {
  category: SupportCaseCategory;
  contactEmail: string;
  contactPhone?: string;
  bookingId?: string;
  description: string;
}): Promise<SupportCaseItem> {
  const response = await fetch('/api/support/cases', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error?.message || body.message || 'Không thể gửi phản ánh hỗ trợ.');
  }

  return body.data;
}

export async function lookupSupportCaseStatus(codeOrId: string): Promise<SupportCaseItem> {
  const response = await fetch(`/api/support/cases/${encodeURIComponent(codeOrId)}/status`);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error?.message || body.message || 'Không tìm thấy hồ sơ khiếu nại.');
  }
  return body.data;
}
