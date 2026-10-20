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
import { BookingWindowDto } from './dto/booking-request.dto.js';
import { AvailabilityResponseDto } from './dto/booking-response.dto.js';
import { presentAvailability } from './booking-response.presenter.js';

@ApiTags('Courts')
@Controller('api/courts')
export class BookingAvailabilityController {
  constructor(private readonly quoteAvailability: QuoteAvailabilityUseCase) {}

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
}
