import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { ActiveCourtReadModel } from '../application/models/court-read-models.js';
import { CourtReader } from '../ports/court-reader.js';
import { courtInclude, type ScheduledCourt } from './court-include.js';
import { toDomainPricingSchedule } from './prisma-court-schedule-reader.js';

@Injectable()
export class PrismaCourtReader extends CourtReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findActiveCourts(): Promise<ActiveCourtReadModel[]> {
    const courts = await this.prisma.court.findMany({
      where: { status: 'ACTIVE', branch: { isActive: true } },
      include: courtInclude,
      orderBy: { code: 'asc' },
    });
    return courts.map(toReadModel);
  }

  async findActiveCourtById(id: string): Promise<ActiveCourtReadModel | null> {
    const court = await this.prisma.court.findFirst({
      where: { id, status: 'ACTIVE', branch: { isActive: true } },
      include: courtInclude,
    });
    return court ? toReadModel(court) : null;
  }
}

function toReadModel(court: ScheduledCourt): ActiveCourtReadModel {
  return {
    id: court.id,
    name: court.name,
    code: court.code,
    courtType: court.courtType,
    status: court.status,
    cleanupMinutes: court.cleanupMinutes,
    branchName: court.branch.name,
    address: court.branch.address,
    schedule: toDomainPricingSchedule(court),
  };
}
