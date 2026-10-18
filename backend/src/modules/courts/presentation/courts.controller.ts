import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { GetActiveCourtDetailUseCase } from '../application/get-active-court-detail.use-case.js';
import { ListActiveCourtsUseCase } from '../application/list-active-courts.use-case.js';
import { CourtResponsePresenter } from './court-response.presenter.js';
import { CourtsResponseDto } from './dto/courts-response.dto.js';

@Controller('api/courts')
export class CourtsController {
  constructor(
    private readonly listActiveCourts: ListActiveCourtsUseCase,
    private readonly getActiveCourtDetail: GetActiveCourtDetailUseCase,
    private readonly presenter: CourtResponsePresenter,
  ) {}

  @Get()
  @ApiOkResponse({ type: CourtsResponseDto })
  async getCourts(): Promise<CourtsResponseDto> {
    const courts = await this.listActiveCourts.execute();
    return {
      success: true,
      data: this.presenter.presentMany(courts),
    };
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    const court = await this.getActiveCourtDetail.execute(id);
    if (!court)
      throw new NotFoundException('Không tìm thấy sân đang hoạt động.');
    return { success: true, data: this.presenter.present(court) };
  }
}
