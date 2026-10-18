import { Module } from '@nestjs/common';
import { CourtScheduleReader } from './application/court-schedule-reader.js';
import { GetActiveCourtDetailUseCase } from './application/get-active-court-detail.use-case.js';
import { ListActiveCourtsUseCase } from './application/list-active-courts.use-case.js';
import { CourtsService } from './courts.service.js';
import { PrismaCourtReader } from './infrastructure/prisma-court-reader.js';
import { PrismaCourtScheduleReader } from './infrastructure/prisma-court-schedule-reader.js';
import { CourtReader } from './ports/court-reader.js';
import { CourtResponsePresenter } from './presentation/court-response.presenter.js';
import { CourtsController } from './presentation/courts.controller.js';

@Module({
  controllers: [CourtsController],
  providers: [
    ListActiveCourtsUseCase,
    GetActiveCourtDetailUseCase,
    CourtResponsePresenter,
    CourtsService,
    { provide: CourtReader, useClass: PrismaCourtReader },
    { provide: CourtScheduleReader, useClass: PrismaCourtScheduleReader },
  ],
  exports: [CourtScheduleReader, CourtsService],
})
export class CourtsModule {}
