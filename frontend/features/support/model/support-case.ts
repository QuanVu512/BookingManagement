export type SupportCaseCategory =
  | 'SERVICE'
  | 'PAYMENT'
  | 'REFUND'
  | 'PRIVACY_ROUTING'
  | 'OTHER';

export type SupportCaseStatus =
  | 'RECEIVED'
  | 'VERIFYING'
  | 'OPEN'
  | 'WAITING_CUSTOMER'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'CLOSED';

export interface SupportCaseItem {
  id?: string;
  caseCode: string;
  category: SupportCaseCategory;
  status: SupportCaseStatus;
  receivedAt: string;
  resolutionTargetAt: string;
  publicNotes?: string | null;
  events?: Array<{
    sequence: number;
    eventCode: string;
    publicNote?: string | null;
    occurredAt: string;
  }>;
}
