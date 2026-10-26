import type { PrivacyRequestItem, PrivacyRequestType } from '../model/privacy-request';

export async function submitPrivacyRequest(input: {
  type: PrivacyRequestType;
  description: string;
  contactEmail?: string;
  csrfToken?: string;
}): Promise<PrivacyRequestItem> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (input.csrfToken) {
    headers['X-CSRF-Token'] = input.csrfToken;
  }

  const response = await fetch('/api/privacy/requests', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({
      type: input.type,
      description: input.description,
      contactEmail: input.contactEmail,
    }),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error?.message || body.message || 'Không thể gửi yêu cầu quyền riêng tư.');
  }

  return body.data;
}

export async function listMyPrivacyRequests(): Promise<PrivacyRequestItem[]> {
  const response = await fetch('/api/privacy/requests', {
    credentials: 'include',
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error?.message || 'Không thể tải danh sách yêu cầu.');
  }
  return body.data || [];
}
