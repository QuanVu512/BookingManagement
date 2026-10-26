import type { SupportCase, SupportCaseEvent } from '../domain/support-case.js';

export const SUPPORT_CASE_STORE = Symbol('SUPPORT_CASE_STORE');

export interface SupportCaseStore {
  createCase(supportCase: SupportCase): Promise<SupportCase>;
  findById(id: string): Promise<SupportCase | null>;
  findByCaseCode(caseCode: string): Promise<SupportCase | null>;
  findByIdempotencyKey(key: string): Promise<SupportCase | null>;
  listEvents(caseId: string): Promise<SupportCaseEvent[]>;
}
