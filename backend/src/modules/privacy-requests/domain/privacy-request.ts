export type PrivacyRequestType =
  | 'ACCESS'
  | 'CORRECT'
  | 'ERASE'
  | 'WITHDRAW'
  | 'RESTRICT'
  | 'OBJECT'
  | 'PROTECT'
  | 'OTHER';

export type PrivacySubjectKind = 'MEMBER' | 'GUEST';

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

export interface PrivacyRequest {
  id: string;
  type: PrivacyRequestType;
  subjectKind: PrivacySubjectKind;
  userId?: string | null;
  bookingId?: string | null;
  contactEmail?: string;
  description: string;
  status: PrivacyRequestStatus;
  receivedAt: Date;
  verifiedAt?: Date | null;
  verificationMethod?: string | null;
  responseDueAt: Date;
  publicNotes?: string | null;
  revision: number;
  idempotencyKey: string;
  completedAt?: Date | null;
}

export interface PrivacyRequestEvent {
  id: string;
  requestId: string;
  sequence: number;
  actorType: 'SYSTEM' | 'CUSTOMER' | 'GUEST' | 'STAFF';
  actorUserId?: string | null;
  eventCode: string;
  publicNote?: string | null;
  occurredAt: Date;
}

export function isValidTransition(
  from: PrivacyRequestStatus,
  to: PrivacyRequestStatus,
): boolean {
  const transitions: Record<PrivacyRequestStatus, PrivacyRequestStatus[]> = {
    RECEIVED: ['AWAITING_VERIFICATION', 'UNDER_REVIEW', 'WITHDRAWN'],
    AWAITING_VERIFICATION: ['UNDER_REVIEW', 'REJECTED', 'WITHDRAWN'],
    UNDER_REVIEW: [
      'NEEDS_INFORMATION',
      'APPROVED',
      'REJECTED',
      'PARTIALLY_COMPLETED',
      'WITHDRAWN',
    ],
    NEEDS_INFORMATION: ['UNDER_REVIEW', 'REJECTED', 'WITHDRAWN'],
    APPROVED: ['FULFILLING', 'COMPLETED', 'PARTIALLY_COMPLETED'],
    FULFILLING: ['COMPLETED', 'PARTIALLY_COMPLETED', 'REJECTED'],
    COMPLETED: [],
    PARTIALLY_COMPLETED: [],
    REJECTED: [],
    WITHDRAWN: [],
  };

  return transitions[from]?.includes(to) ?? false;
}
