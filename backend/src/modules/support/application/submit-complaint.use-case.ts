import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import {
  SUPPORT_CASE_STORE,
  type SupportCaseStore,
} from '../ports/support-case-store.js';
import type {
  SupportCase,
  SupportCaseCategory,
  SupportSubjectKind,
  SupportCaseEvent,
} from '../domain/support-case.js';

export interface SubmitComplaintInput {
  category: SupportCaseCategory;
  subjectKind: SupportSubjectKind;
  userId?: string | null;
  bookingId?: string | null;
  contactEmail: string;
  contactPhone?: string;
  description: string;
  idempotencyKey: string;
}

const VALID_CATEGORIES: SupportCaseCategory[] = [
  'SERVICE',
  'PAYMENT',
  'REFUND',
  'PRIVACY_ROUTING',
  'OTHER',
];

@Injectable()
export class SubmitComplaintUseCase {
  constructor(
    @Inject(SUPPORT_CASE_STORE)
    private readonly caseStore: SupportCaseStore,
  ) {}

  async execute(input: SubmitComplaintInput): Promise<SupportCase> {
    if (!VALID_CATEGORIES.includes(input.category)) {
      throw new BadRequestException({
        code: 'INVALID_CATEGORY',
        message: 'Danh mục khiếu nại không hợp lệ.',
      });
    }

    if (!input.contactEmail || !input.contactEmail.includes('@')) {
      throw new BadRequestException({
        code: 'INVALID_EMAIL',
        message: 'Vui lòng cung cấp email liên hệ hợp lệ.',
      });
    }

    if (!input.description || input.description.trim().length < 10) {
      throw new BadRequestException({
        code: 'DESCRIPTION_TOO_SHORT',
        message: 'Nội dung phản ánh tối thiểu 10 ký tự.',
      });
    }

    const existing = await this.caseStore.findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      return existing;
    }

    const now = new Date();
    // 3 business days SLA target
    const resolutionTargetAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const caseCode = `SPT-${randomSuffix}`;

    const newCase: SupportCase = {
      id: crypto.randomUUID(),
      caseCode,
      category: input.category,
      subjectKind: input.subjectKind,
      userId: input.userId ?? null,
      bookingId: input.bookingId ?? null,
      contactEmail: input.contactEmail.trim().toLowerCase(),
      contactPhone: input.contactPhone?.trim(),
      description: input.description.trim(),
      status: 'RECEIVED',
      receivedAt: now,
      resolutionTargetAt,
      publicNotes: 'Vụ việc đã được ghi nhận và chuyển điều phối viên xem xét.',
      idempotencyKey: input.idempotencyKey,
    };

    return this.caseStore.createCase(newCase);
  }
}

@Injectable()
export class GetOwnComplaintUseCase {
  constructor(
    @Inject(SUPPORT_CASE_STORE)
    private readonly caseStore: SupportCaseStore,
  ) {}

  async execute(
    codeOrId: string,
  ): Promise<{ supportCase: SupportCase; events: SupportCaseEvent[] }> {
    let supportCase = await this.caseStore.findByCaseCode(codeOrId);
    if (!supportCase) {
      supportCase = await this.caseStore.findById(codeOrId);
    }

    if (!supportCase) {
      throw new NotFoundException({
        code: 'CASE_NOT_FOUND',
        message: 'Không tìm thấy hồ sơ khiếu nại.',
      });
    }

    const events = await this.caseStore.listEvents(supportCase.id);
    return { supportCase, events };
  }
}
