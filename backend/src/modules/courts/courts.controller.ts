import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { CourtsService } from './courts.service.js';
import { CourtsResponseDto } from './dto/courts-response.dto.js';

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
}
