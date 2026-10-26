export type SupportCaseCategory =
  | 'SERVICE'
  | 'PAYMENT'
  | 'REFUND'
  | 'PRIVACY_ROUTING'
  | 'OTHER';

export type SupportSubjectKind = 'MEMBER' | 'GUEST' | 'CONTACT_ONLY';

export type SupportCaseStatus =
  | 'RECEIVED'
  | 'VERIFYING'
  | 'OPEN'
  | 'WAITING_CUSTOMER'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'CLOSED';

export interface SupportCase {
  id: string;
  caseCode: string;
  category: SupportCaseCategory;
  subjectKind: SupportSubjectKind;
  userId?: string | null;
  bookingId?: string | null;
  contactEmail: string;
  contactPhone?: string;
  description: string;
  status: SupportCaseStatus;
  receivedAt: Date;
  resolutionTargetAt: Date;
  publicNotes?: string | null;
  idempotencyKey: string;
}

export interface SupportCaseEvent {
  id: string;
  caseId: string;
  sequence: number;
  actorType: 'SYSTEM' | 'CUSTOMER' | 'GUEST' | 'STAFF';
  eventCode: string;
  publicNote?: string | null;
  occurredAt: Date;
}
