import { describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { CourtsService } from './courts.service.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

describe('Public court catalog has no silent fixture fallback', () => {
  async function service(findMany: () => Promise<unknown[]>) {
    const module = await Test.createTestingModule({
      providers: [
        CourtsService,
        { provide: PrismaService, useValue: { court: { findMany } } },
      ],
    }).compile();
    return module.get(CourtsService);
  }
  it('returns an empty database result unchanged', async () => {
    const courts = await service(async () => []);
    expect(await courts.getPublicCourts()).toEqual([]);
  });
  it('propagates database failure instead of showing sample courts', async () => {
    const findMany = jest
      .fn<() => Promise<unknown[]>>()
      .mockRejectedValue(new Error('database unavailable'));
    const courts = await service(findMany);
    await expect(courts.getPublicCourts()).rejects.toThrow(
      'database unavailable',
    );
  });
});
