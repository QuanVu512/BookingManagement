import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import {
  PRIVACY_REQUEST_STORE,
  type PrivacyRequestStore,
} from '../ports/privacy-request-store.js';
import type {
  PrivacyRequest,
  PrivacyRequestType,
  PrivacySubjectKind,
} from '../domain/privacy-request.js';

export interface SubmitPrivacyRequestInput {
  type: PrivacyRequestType;
  subjectKind: PrivacySubjectKind;
  userId?: string | null;
  bookingId?: string | null;
  contactEmail?: string;
  description: string;
  idempotencyKey: string;
}

const VALID_TYPES: PrivacyRequestType[] = [
  'ACCESS',
  'CORRECT',
  'ERASE',
  'WITHDRAW',
  'RESTRICT',
  'OBJECT',
  'PROTECT',
  'OTHER',
];

@Injectable()
export class SubmitPrivacyRequestUseCase {
  constructor(
    @Inject(PRIVACY_REQUEST_STORE)
    private readonly requestStore: PrivacyRequestStore,
  ) {}

  async execute(input: SubmitPrivacyRequestInput): Promise<PrivacyRequest> {
    if (!VALID_TYPES.includes(input.type)) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST_TYPE',
        message: 'Loại yêu cầu quyền riêng tư không hợp lệ.',
      });
    }

    if (!input.description || input.description.trim().length < 10) {
      throw new BadRequestException({
        code: 'DESCRIPTION_TOO_SHORT',
        message: 'Mô tả chi tiết yêu cầu phải tối thiểu 10 ký tự.',
      });
    }

    if (input.description.length > 2000) {
      throw new BadRequestException({
        code: 'DESCRIPTION_TOO_LONG',
        message: 'Mô tả không được vượt quá 2000 ký tự.',
      });
    }

    const existing = await this.requestStore.findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      return existing;
    }

    const now = new Date();
    // Default deadline: 30 days as per standard privacy regulations
    const responseDueAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const newRequest: PrivacyRequest = {
      id: crypto.randomUUID(),
      type: input.type,
      subjectKind: input.subjectKind,
      userId: input.userId ?? null,
      bookingId: input.bookingId ?? null,
      contactEmail: input.contactEmail,
      description: input.description.trim(),
      status: input.subjectKind === 'MEMBER' ? 'UNDER_REVIEW' : 'AWAITING_VERIFICATION',
      receivedAt: now,
      verifiedAt: input.subjectKind === 'MEMBER' ? now : null,
      verificationMethod: input.subjectKind === 'MEMBER' ? 'ACCOUNT_SESSION' : null,
      responseDueAt,
      publicNotes: 'Yêu cầu đang được phòng bảo vệ dữ liệu tiếp nhận và rà soát.',
      revision: 0,
      idempotencyKey: input.idempotencyKey,
    };

    return this.requestStore.createRequest(newRequest);
  }
}
