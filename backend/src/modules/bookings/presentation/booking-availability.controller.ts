import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { QuoteAvailabilityUseCase } from '../application/quote-availability.use-case.js';
import { GetCourtDayOccupanciesUseCase } from '../application/get-court-day-occupancies.use-case.js';
import { BookingWindowDto } from './dto/booking-request.dto.js';
import { AvailabilityResponseDto } from './dto/booking-response.dto.js';
import { CourtDayOccupanciesResponseDto } from './dto/court-occupancies.dto.js';
import {
  presentAvailability,
  presentCourtDayOccupancies,
} from './booking-response.presenter.js';
import { rethrowBookingHttpError } from './booking-error.presenter.js';

@ApiTags('Courts')
@Controller('api/courts')
export class BookingAvailabilityController {
  constructor(
    private readonly quoteAvailability: QuoteAvailabilityUseCase,
    private readonly courtDayOccupancies: GetCourtDayOccupanciesUseCase,
  ) {}

  @Get(':id/availability')
  @ApiOkResponse({ type: AvailabilityResponseDto })
  @Header('Cache-Control', 'no-store, private')
  async availability(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() window: BookingWindowDto,
  ) {
    return {
      success: true,
      data: presentAvailability(
        await this.quoteAvailability.execute({
          courtId: id,
          startsAt: window.startsAt,
          endsAt: window.endsAt,
        }),
      ),
    };
  }

  @Get(':id/occupancies')
  @ApiOkResponse({ type: CourtDayOccupanciesResponseDto })
  @Header('Cache-Control', 'no-store, private')
  async occupancies(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('date') date: string,
  ) {
    try {
      return {
        success: true,
        data: presentCourtDayOccupancies(
          await this.courtDayOccupancies.execute({ courtId: id, date }),
        ),
      };
    } catch (error: unknown) {
      rethrowBookingHttpError(error);
    }
  }
}
