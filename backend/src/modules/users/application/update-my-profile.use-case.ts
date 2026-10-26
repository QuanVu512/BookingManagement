import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import {
  normalizeProfilePatch,
  type NormalizedProfilePatch,
} from '../domain/profile-policy.js';

/**
 * C12 — Cập nhật hồ sơ của chính mình.
 * - Chỉ fullName/avatarUrl; upsert profile (không chạm user/roles và
 *   booking snapshots — booking lưu contact snapshot bất biến riêng).
 * - Patch rỗng → 400. Domain policy là single source validate.
 */
@Injectable()
export class UpdateMyProfileUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    userId: string,
    input: { fullName?: unknown; avatarUrl?: unknown },
  ) {
    let patch: NormalizedProfilePatch;
    try {
      patch = normalizeProfilePatch(input);
    } catch (error: unknown) {
      throw new BadRequestException({
        code: 'INVALID_PROFILE',
        message: error instanceof Error ? error.message : 'Hồ sơ không hợp lệ.',
      });
    }
    if (patch.fullName === undefined && patch.avatarUrl === undefined) {
      throw new BadRequestException({
        code: 'EMPTY_PATCH',
        message: 'Chưa có trường hồ sơ nào để cập nhật.',
      });
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Tài khoản không tồn tại.',
      });
    }
    const profile = await this.prisma.userProfile.upsert({
      where: { userId },
      update: {
        ...(patch.fullName !== undefined ? { fullName: patch.fullName } : {}),
        ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl } : {}),
      },
      create: {
        userId,
        fullName: patch.fullName ?? 'Khách hàng',
        avatarUrl: patch.avatarUrl ?? null,
      },
      select: { fullName: true, avatarUrl: true, updatedAt: true },
    });
    return {
      userId,
      fullName: profile.fullName,
      avatarUrl: profile.avatarUrl,
      updatedAt: profile.updatedAt.toISOString(),
    };
  }
}
