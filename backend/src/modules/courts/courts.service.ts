import { Injectable, NotFoundException } from '@nestjs/common';
import { GetActiveCourtDetailUseCase } from './application/get-active-court-detail.use-case.js';
import { ListActiveCourtsUseCase } from './application/list-active-courts.use-case.js';
import type { PublicCourtDto } from './presentation/dto/courts-response.dto.js';
import { CourtResponsePresenter } from './presentation/court-response.presenter.js';

/**
 * Compatibility facade for callers that still resolve the former public
 * CourtsService. New HTTP callers use the use cases directly; this shim owns
 * no persistence or pricing logic of its own.
 */
@Injectable()
export class CourtsService {
  constructor(
    private readonly listActiveCourts: ListActiveCourtsUseCase,
    private readonly getActiveCourtDetail: GetActiveCourtDetailUseCase,
    private readonly presenter: CourtResponsePresenter,
  ) {}

  async getPublicCourts(): Promise<PublicCourtDto[]> {
    return this.presenter.presentMany(await this.listActiveCourts.execute());
  }

  async getPublicCourt(id: string): Promise<PublicCourtDto> {
    const court = await this.getActiveCourtDetail.execute(id);
    if (!court)
      throw new NotFoundException('Không tìm thấy sân đang hoạt động.');
    return this.presenter.present(court);
  }
}
