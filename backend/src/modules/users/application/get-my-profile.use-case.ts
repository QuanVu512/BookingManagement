import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';

export interface MyProfile {
  userId: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
  email: string;
  phone: string;
  roles: string[];
}

/**
 * C12 — Đọc hồ sơ của chính mình (owner từ session, không body userId).
 * email/phone/roles chỉ đọc (D15).
 */
@Injectable()
export class GetMyProfileUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(userId: string): Promise<MyProfile | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        phone: true,
        profile: { select: { fullName: true, avatarUrl: true } },
        roles: { select: { role: true } },
      },
    });
    if (!user) return null;
    return {
      userId: user.id,
      username: user.username,
      fullName: user.profile?.fullName ?? user.username,
      avatarUrl: user.profile?.avatarUrl ?? null,
      email: user.email,
      phone: user.phone,
      roles: user.roles.map((row) => String(row.role)),
    };
  }
}
