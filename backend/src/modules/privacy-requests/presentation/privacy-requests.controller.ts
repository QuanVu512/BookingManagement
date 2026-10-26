import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { AuthCsrfGuard } from '../../auth/guards/auth-csrf.guard.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { SubmitPrivacyRequestUseCase } from '../application/submit-privacy-request.use-case.js';
import {
  GetOwnPrivacyRequestUseCase,
  ListOwnPrivacyRequestsUseCase,
} from '../application/get-own-request.use-case.js';
import { CreatePrivacyRequestDto } from './dto/privacy-request.dto.js';

@Controller('privacy/requests')
export class PrivacyRequestsController {
  constructor(
    private readonly submitUseCase: SubmitPrivacyRequestUseCase,
    private readonly listOwnUseCase: ListOwnPrivacyRequestsUseCase,
    private readonly getOwnUseCase: GetOwnPrivacyRequestUseCase,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, AuthCsrfGuard)
  async submitMemberRequest(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreatePrivacyRequestDto,
    @Headers('x-idempotency-key') headerIdempotencyKey?: string,
  ) {
    const idempotencyKey =
      dto.idempotencyKey || headerIdempotencyKey || crypto.randomUUID();

    const request = await this.submitUseCase.execute({
      type: dto.type,
      subjectKind: 'MEMBER',
      userId,
      contactEmail: dto.contactEmail,
      description: dto.description,
      idempotencyKey,
    });

    return {
      success: true,
      data: request,
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async listMyRequests(@CurrentUser('userId') userId: string) {
    const requests = await this.listOwnUseCase.executeForUser(userId);
    return {
      success: true,
      data: requests,
    };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getMyRequest(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    const result = await this.getOwnUseCase.execute(id, { userId });
    return {
      success: true,
      data: result,
    };
  }
}
