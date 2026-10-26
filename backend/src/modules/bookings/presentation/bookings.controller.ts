import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { AuthCsrfGuard } from '../../auth/guards/auth-csrf.guard.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { CreateHoldUseCase } from '../application/create-hold.use-case.js';
import { ListMyBookingsUseCase } from '../application/list-my-bookings.use-case.js';
import { CancelHoldUseCase } from '../application/cancel-hold.use-case.js';
import { RequestPaidCancellationUseCase } from '../application/request-paid-cancellation.use-case.js';
import { ApplyPaidCancellationUseCase } from '../application/apply-paid-cancellation.use-case.js';
import { CreateBookingDto } from './dto/booking-request.dto.js';
import {
  ApplyCancelDto,
  RequestCancelQuoteDto,
} from './dto/cancel-request.dto.js';
import {
  BookingResponseDto,
  MyBookingsResponseDto,
} from './dto/booking-response.dto.js';
import {
  rethrowBookingHttpError,
  rethrowCreateHoldHttpError,
} from './booking-error.presenter.js';
import { presentBooking } from './booking-response.presenter.js';

@Controller('api/bookings')
@UseGuards(JwtAuthGuard, AuthCsrfGuard)
@ApiBearerAuth()
export class BookingsController {
  constructor(
    private readonly createHold: CreateHoldUseCase,
    private readonly listMine: ListMyBookingsUseCase,
    private readonly cancelHold: CancelHoldUseCase,
    private readonly requestCancelQuote: RequestPaidCancellationUseCase,
    private readonly applyCancel: ApplyPaidCancellationUseCase,
  ) {}

  @Post()
  @ApiCreatedResponse({ type: BookingResponseDto })
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({
    summary: 'Giữ sân 5 phút; retry cùng key trả trạng thái hiện tại',
  })
  async create(
    @CurrentUser('userId') userId: string,
    @Body() input: CreateBookingDto,
  ) {
    try {
      return {
        success: true,
        data: presentBooking(
          await this.createHold.execute({
            userId,
            courtId: input.courtId,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            idempotencyKey: input.idempotencyKey,
            prepaymentPercent: input.prepaymentPercent,
          }),
        ),
      };
    } catch (error: unknown) {
      return rethrowCreateHoldHttpError(error);
    }
  }

  @Get('me')
  @ApiOkResponse({ type: MyBookingsResponseDto })
  @Header('Cache-Control', 'no-store, private')
  async mine(
    @CurrentUser('userId') userId: string,
    @Query('cursor', new ParseUUIDPipe({ optional: true })) cursor?: string,
  ) {
    const page = await this.listMine.execute(userId, cursor);
    return {
      success: true,
      data: page.bookings.map(presentBooking),
      nextCursor: page.nextCursor,
    };
  }

  @Patch(':id/cancel')
  @ApiOkResponse({ type: BookingResponseDto })
  @Header('Cache-Control', 'no-store, private')
  async cancel(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    try {
      return {
        success: true,
        data: presentBooking(
          await this.cancelHold.execute({ userId, bookingId: id }),
        ),
      };
    } catch (error: unknown) {
      return rethrowBookingHttpError(error);
    }
  }

  @Post(':id/cancel-quote')
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'C08: báo phí hủy có hoàn (persist quote + consent)' })
  async cancelQuote(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: RequestCancelQuoteDto,
  ) {
    const quote = await this.requestCancelQuote.execute({
      bookingId: id,
      actorUserId: userId,
      actorType: 'CUSTOMER',
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
    });
    return {
      success: true,
      data: {
        ...quote,
        expiresAt: quote.expiresAt.toISOString(),
      },
    };
  }

  @Post(':id/cancel-apply')
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'C08: áp dụng hủy có hoàn (explicit consent)' })
  async cancelApply(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ApplyCancelDto,
  ) {
    return {
      success: true,
      data: await this.applyCancel.execute({
        bookingId: id,
        quoteId: input.quoteId,
        accepted: input.accepted,
        actorUserId: userId,
        actorType: 'CUSTOMER',
        idempotencyKey: input.idempotencyKey,
      }),
    };
  }
}
