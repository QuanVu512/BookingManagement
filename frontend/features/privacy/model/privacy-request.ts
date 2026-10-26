export type PrivacyRequestType =
  | 'ACCESS'
  | 'CORRECT'
  | 'ERASE'
  | 'WITHDRAW'
  | 'RESTRICT'
  | 'OBJECT'
  | 'PROTECT'
  | 'OTHER';

export type PrivacyRequestStatus =
  | 'RECEIVED'
  | 'AWAITING_VERIFICATION'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'FULFILLING'
  | 'COMPLETED'
  | 'NEEDS_INFORMATION'
  | 'REJECTED'
  | 'PARTIALLY_COMPLETED'
  | 'WITHDRAWN';

export interface PrivacyRequestItem {
  id: string;
  type: PrivacyRequestType;
  subjectKind: 'MEMBER' | 'GUEST';
  status: PrivacyRequestStatus;
  receivedAt: string;
  verifiedAt?: string | null;
  responseDueAt: string;
  publicNotes?: string | null;
  revision: number;
}
