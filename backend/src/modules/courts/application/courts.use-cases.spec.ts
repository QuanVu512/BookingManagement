import { describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CourtsService } from '../courts.service.js';
import type { ActiveCourtReadModel } from './models/court-read-models.js';
import { CourtReader } from '../ports/court-reader.js';
import { CourtResponsePresenter } from '../presentation/court-response.presenter.js';
import { GetActiveCourtDetailUseCase } from './get-active-court-detail.use-case.js';
import { ListActiveCourtsUseCase } from './list-active-courts.use-case.js';

function readModel(): ActiveCourtReadModel {
  return {
    id: 'court-1',
    name: 'Court One',
    code: 'VIP-01',
    courtType: 'VIP',
    status: 'ACTIVE',
    cleanupMinutes: 15,
    branchName: 'Test branch',
    address: 'Public address',
    schedule: {
      timezone: 'Asia/Ho_Chi_Minh',
      businessHours: Array.from({ length: 7 }, (_, index) => ({
        dayOfWeek: index + 1,
        openMinute: 360,
        closeMinute: 1380,
        isClosed: false,
      })),
      priceRules: [
        {
          id: 'base',
          startTimeMinute: 360,
          endTimeMinute: 1380,
          pricePerHour: 100000n,
          priority: 0,
          isActive: true,
          dayOfWeek: null,
          effectiveFromDate: '2020-01-01',
          effectiveToDate: null,
        },
      ],
    },
  };
}

async function moduleFor(reader: Partial<CourtReader>) {
  const module = await Test.createTestingModule({
    providers: [
      ListActiveCourtsUseCase,
      GetActiveCourtDetailUseCase,
      CourtResponsePresenter,
      CourtsService,
      { provide: CourtReader, useValue: reader },
    ],
  }).compile();
  return {
    list: module.get(ListActiveCourtsUseCase),
    detail: module.get(GetActiveCourtDetailUseCase),
    facade: module.get(CourtsService),
  };
}

describe('Public court catalog has no silent fixture fallback', () => {
  it('returns an empty database result unchanged', async () => {
    const { list, facade } = await moduleFor({
      findActiveCourts: async () => [],
    });
    expect(await list.execute()).toEqual([]);
    expect(await facade.getPublicCourts()).toEqual([]);
  });

  it('propagates database failure instead of showing sample courts', async () => {
    const findActiveCourts = jest
      .fn<() => Promise<ActiveCourtReadModel[]>>()
      .mockRejectedValue(new Error('database unavailable'));
    const { list } = await moduleFor({ findActiveCourts });
    await expect(list.execute()).rejects.toThrow('database unavailable');
  });

  it('maps an active court with its deterministic starting price', async () => {
    const { list } = await moduleFor({
      findActiveCourts: async () => [readModel()],
    });
    const [court] = await list.execute();
    expect(court).toMatchObject({ id: 'court-1', startingPrice: 100000 });
  });

  it('returns null for a missing active court instead of throwing from the reader port', async () => {
    const { detail } = await moduleFor({
      findActiveCourtById: async () => null,
    });
    expect(await detail.execute('court-1')).toBeNull();
  });

  it('keeps the facade 404 contract for a missing active court', async () => {
    const { facade } = await moduleFor({
      findActiveCourtById: async () => null,
    });
    await expect(facade.getPublicCourt('court-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('presents the public DTO through the compatibility facade', async () => {
    const { facade } = await moduleFor({
      findActiveCourtById: async () => readModel(),
    });
    expect(await facade.getPublicCourt('court-1')).toMatchObject({
      id: 'court-1',
      branchName: 'Test branch',
      pricePerHour: 100000,
      features: ['Vệ sinh 15 phút sau lượt chơi'],
    });
  });
});
