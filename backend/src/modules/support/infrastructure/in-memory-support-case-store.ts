import { Injectable } from '@nestjs/common';
import type { SupportCase, SupportCaseEvent } from '../domain/support-case.js';
import type { SupportCaseStore } from '../ports/support-case-store.js';

@Injectable()
export class InMemorySupportCaseStore implements SupportCaseStore {
  private cases = new Map<string, SupportCase>();
  private events = new Map<string, SupportCaseEvent[]>();

  async createCase(supportCase: SupportCase): Promise<SupportCase> {
    const existing = await this.findByIdempotencyKey(supportCase.idempotencyKey);
    if (existing) {
      return existing;
    }

    this.cases.set(supportCase.id, { ...supportCase });
    const initialEvent: SupportCaseEvent = {
      id: crypto.randomUUID(),
      caseId: supportCase.id,
      sequence: 1,
      actorType:
        supportCase.subjectKind === 'MEMBER'
          ? 'CUSTOMER'
          : supportCase.subjectKind === 'GUEST'
            ? 'GUEST'
            : 'SYSTEM',
      eventCode: 'CASE_RECEIVED',
      publicNote: 'Yêu cầu hỗ trợ/khiếu nại đã được ghi nhận trên hệ thống.',
      occurredAt: new Date(),
    };
    this.events.set(supportCase.id, [initialEvent]);
    return { ...supportCase };
  }

  async findById(id: string): Promise<SupportCase | null> {
    const found = this.cases.get(id);
    return found ? { ...found } : null;
  }

  async findByCaseCode(caseCode: string): Promise<SupportCase | null> {
    const found = Array.from(this.cases.values()).find(
      (c) => c.caseCode.toUpperCase() === caseCode.toUpperCase(),
    );
    return found ? { ...found } : null;
  }

  async findByIdempotencyKey(key: string): Promise<SupportCase | null> {
    const found = Array.from(this.cases.values()).find(
      (c) => c.idempotencyKey === key,
    );
    return found ? { ...found } : null;
  }

  async listEvents(caseId: string): Promise<SupportCaseEvent[]>;
  async listEvents(caseId: string): Promise<SupportCaseEvent[]> {
    return [...(this.events.get(caseId) || [])];
  }
}
