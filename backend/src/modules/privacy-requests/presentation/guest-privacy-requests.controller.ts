import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { SubmitPrivacyRequestUseCase } from '../application/submit-privacy-request.use-case.js';
import {
  GetOwnPrivacyRequestUseCase,
  ListOwnPrivacyRequestsUseCase,
} from '../application/get-own-request.use-case.js';
import { CreatePrivacyRequestDto } from './dto/privacy-request.dto.js';
import { GuestTokenService } from '../../payments/infrastructure/guest-token.service.js';

@Controller('guest/bookings/:bookingId/privacy/requests')
export class GuestPrivacyRequestsController {
  constructor(
    private readonly submitUseCase: SubmitPrivacyRequestUseCase,
    private readonly listOwnUseCase: ListOwnPrivacyRequestsUseCase,
    private readonly getOwnUseCase: GetOwnPrivacyRequestUseCase,
    private readonly guestTokenService: GuestTokenService,
  ) {}

  private async assertValidGuestToken(bookingId: string, tokenHeader?: string) {
    if (!tokenHeader) {
      throw new UnauthorizedException({
        code: 'GUEST_TOKEN_REQUIRED',
        message: 'Yêu cầu mã truy cập khách hợp lệ (X-Booking-Access-Token).',
      });
    }

    const verified = await this.guestTokenService.verifyManageToken(
      tokenHeader,
      bookingId,
    );
    if (!verified || verified.bookingId !== bookingId) {
      throw new UnauthorizedException({
        code: 'INVALID_GUEST_TOKEN',
        message: 'Mã truy cập khách không hợp lệ hoặc đã hết hạn.',
      });
    }
    return verified;
  }

  @Post()
  async submitGuestRequest(
    @Param('bookingId') bookingId: string,
    @Body() dto: CreatePrivacyRequestDto,
    @Headers('x-booking-access-token') tokenHeader?: string,
    @Headers('x-idempotency-key') headerIdempotencyKey?: string,
  ) {
    await this.assertValidGuestToken(bookingId, tokenHeader);

    const idempotencyKey =
      dto.idempotencyKey || headerIdempotencyKey || crypto.randomUUID();

    const request = await this.submitUseCase.execute({
      type: dto.type,
      subjectKind: 'GUEST',
      bookingId,
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
  async listGuestRequests(
    @Param('bookingId') bookingId: string,
    @Headers('x-booking-access-token') tokenHeader?: string,
  ) {
    await this.assertValidGuestToken(bookingId, tokenHeader);
    const requests = await this.listOwnUseCase.executeForBooking(bookingId);
    return {
      success: true,
      data: requests,
    };
  }

  @Get(':id')
  async getGuestRequest(
    @Param('bookingId') bookingId: string,
    @Param('id') id: string,
    @Headers('x-booking-access-token') tokenHeader?: string,
  ) {
    await this.assertValidGuestToken(bookingId, tokenHeader);
    const result = await this.getOwnUseCase.execute(id, { bookingId });
    return {
      success: true,
      data: result,
    };
  }
}
