import { describe, expect, it, jest } from '@jest/globals';
import { GetMyProfileUseCase } from './get-my-profile.use-case.js';
import { UpdateMyProfileUseCase } from './update-my-profile.use-case.js';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';

// UNVERIFIED (backend test scope BLOCKED) — authored per plan, not executed.
describe('profile use cases (C12)', () => {
  it('get trả hồ sơ + roles, thiếu user → null', async () => {
    const user = {
      id: 'u-1',
      username: 'an12345',
      email: 'an@example.com',
      phone: '0900000001',
      profile: { fullName: 'An', avatarUrl: null },
      roles: [{ role: 'CUSTOMER' }],
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
    };
    const useCase = new GetMyProfileUseCase(
      prisma as unknown as PrismaService,
    );
    await expect(useCase.execute('u-1')).resolves.toMatchObject({
      userId: 'u-1',
      fullName: 'An',
      avatarUrl: null,
      email: 'an@example.com',
      roles: ['CUSTOMER'],
    });
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(useCase.execute('missing')).resolves.toBeNull();
  });

  it('update từ chối patch rỗng và profile không hợp lệ', async () => {
    const prisma = {
      user: { findUnique: jest.fn() },
      userProfile: { upsert: jest.fn() },
    };
    const useCase = new UpdateMyProfileUseCase(
      prisma as unknown as PrismaService,
    );
    await expect(useCase.execute('u-1', {})).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      useCase.execute('u-1', { avatarUrl: 'javascript:alert(1)' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('update upsert đúng field, không chạm identity', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u-1' }) },
      userProfile: {
        upsert: jest.fn().mockImplementation(async () => ({
          fullName: 'An Nguyen',
          avatarUrl: null,
          updatedAt: new Date('2035-01-01T00:00:00Z'),
        })),
      },
    };
    const useCase = new UpdateMyProfileUseCase(
      prisma as unknown as PrismaService,
    );
    const result = await useCase.execute('u-1', { fullName: '  An   Nguyen ' });
    expect(result).toMatchObject({ userId: 'u-1', fullName: 'An Nguyen' });
    const upsertArg = prisma.userProfile.upsert.mock.calls[0][0] as {
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    };
    expect(Object.keys(upsertArg.update)).toEqual(['fullName']);
    expect(upsertArg.create).not.toHaveProperty('email');
    expect(upsertArg.create).not.toHaveProperty('phone');
  });
});
