import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { AuthCsrfGuard } from '../../auth/guards/auth-csrf.guard.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { GetMyProfileUseCase } from '../application/get-my-profile.use-case.js';
import { UpdateMyProfileUseCase } from '../application/update-my-profile.use-case.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

/**
 * C12 — Hồ sơ của chính mình. Owner luôn lấy từ session (D15: identity
 * fields email/phone/roles chỉ đọc, không có endpoint đổi ở đây).
 */
@ApiBearerAuth()
@Controller('api/users/me')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(
    private readonly getProfile: GetMyProfileUseCase,
    private readonly updateProfile: UpdateMyProfileUseCase,
  ) {}

  @Get('profile')
  @ApiOperation({ summary: 'C12: xem hồ sơ của mình' })
  async getMyProfile(@CurrentUser('userId') userId: string) {
    const profile = await this.getProfile.execute(userId);
    if (!profile) {
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Tài khoản không tồn tại.',
      });
    }
    return { success: true, data: profile };
  }

  @Patch('profile')
  @HttpCode(200)
  @UseGuards(AuthCsrfGuard)
  @ApiOperation({ summary: 'C12: cập nhật họ tên / ảnh đại diện' })
  async updateMyProfile(
    @CurrentUser('userId') userId: string,
    @Body() input: UpdateProfileDto,
  ) {
    return {
      success: true,
      data: await this.updateProfile.execute(userId, input),
    };
  }
}
