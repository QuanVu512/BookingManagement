import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { CourtsService } from './courts.service.js';
import { CourtsResponseDto } from './dto/courts-response.dto.js';
import { BookingWindowDto } from '../bookings/dto/booking-request.dto.js';
import { AvailabilityResponseDto } from '../bookings/dto/booking-response.dto.js';

@Controller('api/courts')
export class CourtsController {
  constructor(private readonly courtsService: CourtsService) {}

  @Get()
  @ApiOkResponse({ type: CourtsResponseDto })
  async getCourts(): Promise<CourtsResponseDto> {
    const courts = await this.courtsService.getPublicCourts();
    return {
      success: true,
      data: courts,
    };
  }
  @Get(':id/availability')
  @ApiOkResponse({ type: AvailabilityResponseDto })
  @Header('Cache-Control', 'no-store, private')
  async availability(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() window: BookingWindowDto,
  ) {
    return {
      success: true,
      data: await this.courtsService.availability(id, window),
    };
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.courtsService.getPublicCourt(id) };
  }
}
