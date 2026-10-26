import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import {
  SubmitComplaintUseCase,
  GetOwnComplaintUseCase,
} from '../application/submit-complaint.use-case.js';
import type {
  SupportCaseCategory,
  SupportSubjectKind,
} from '../domain/support-case.js';

export class CreateSupportCaseDto {
  category: SupportCaseCategory;
  subjectKind?: SupportSubjectKind;
  bookingId?: string;
  contactEmail: string;
  contactPhone?: string;
  description: string;
  idempotencyKey?: string;
}

@Controller('support/cases')
export class SupportController {
  constructor(
    private readonly submitUseCase: SubmitComplaintUseCase,
    private readonly getOwnUseCase: GetOwnComplaintUseCase,
  ) {}

  @Post()
  async submitCase(
    @Body() dto: CreateSupportCaseDto,
    @Headers('x-idempotency-key') headerKey?: string,
  ) {
    const idempotencyKey = dto.idempotencyKey || headerKey || crypto.randomUUID();
    const result = await this.submitUseCase.execute({
      category: dto.category,
      subjectKind: dto.subjectKind || 'CONTACT_ONLY',
      bookingId: dto.bookingId,
      contactEmail: dto.contactEmail,
      contactPhone: dto.contactPhone,
      description: dto.description,
      idempotencyKey,
    });

    return {
      success: true,
      data: {
        id: result.id,
        caseCode: result.caseCode,
        category: result.category,
        status: result.status,
        receivedAt: result.receivedAt,
        resolutionTargetAt: result.resolutionTargetAt,
        publicNotes: result.publicNotes,
      },
    };
  }

  @Get(':codeOrId/status')
  async getStatus(@Param('codeOrId') codeOrId: string) {
    const { supportCase, events } = await this.getOwnUseCase.execute(codeOrId);
    return {
      success: true,
      data: {
        caseCode: supportCase.caseCode,
        category: supportCase.category,
        status: supportCase.status,
        receivedAt: supportCase.receivedAt,
        resolutionTargetAt: supportCase.resolutionTargetAt,
        publicNotes: supportCase.publicNotes,
        events: events.map((e) => ({
          sequence: e.sequence,
          eventCode: e.eventCode,
          publicNote: e.publicNote,
          occurredAt: e.occurredAt,
        })),
      },
    };
  }
}
