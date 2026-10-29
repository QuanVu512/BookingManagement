import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { AuthCsrfGuard } from '../../auth/guards/auth-csrf.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { Role } from '../../../enums/index.js';
import {
  GuestCreateHoldUseCase,
  type GuestCreateHoldInput,
} from '../application/guest-create-hold.use-case.js';
import { SendGuestOtpUseCase } from '../application/send-guest-otp.use-case.js';
import { VerifyGuestOtpUseCase } from '../application/verify-guest-otp.use-case.js';
import { ResumeGuestIntentUseCase } from '../application/resume-guest-intent.use-case.js';
import { CancelGuestHoldUseCase } from '../application/cancel-guest-hold.use-case.js';
import { GetGuestHoldRecoveryUseCase } from '../application/get-guest-hold-recovery.use-case.js';
import { GuestCheckoutTokenGuard } from '../infrastructure/guest-checkout-token.guard.js';
import { GuestTokenService } from '../infrastructure/guest-token.service.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';

export class GuestCreateBookingDto implements GuestCreateHoldInput {
  @IsUUID() courtId!: string;
  @IsString() startsAt!: string;
  @IsString() endsAt!: string;
  @IsString() @Length(1, 150) customerName!: string;
  @IsString() @Length(6, 20) customerPhone!: string;
  @IsEmail() customerEmail!: string;
  @IsOptional()
  @IsInt()
  @IsIn([30])
  prepaymentPercent?: number;
  @IsString()
  @Length(16, 100)
  @Matches(/^[A-Za-z0-9_-]+$/)
  idempotencyKey!: string;
  /** Proof một lần từ POST /verify-otp (gop_<64 hex>). */
  @IsString()
  @Length(8, 200)
  otpProof!: string;
  @IsString()
  @Length(16, 100)
  @Matches(/^[A-Za-z0-9_-]+$/)
  checkoutIntentId!: string;
  @IsString()
  @Length(32, 200)
  recoverySecret!: string;
  @IsOptional()
  @IsString()
  @Length(1, 30)
  termsVersion?: string;
}

export class SendGuestOtpDto {
  @IsEmail()
  email!: string;
}

export class VerifyGuestOtpDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^[0-9]{6}$/)
  code!: string;
}

export class ResumeGuestIntentDto {
  @IsUUID()
  checkoutIntentId!: string;

  @IsString()
  @Length(32, 200)
  recoverySecret!: string;
}

/**
 * E3 — Guest booking entry (MIG-11).
 * Public + rate limit 10/IP/5 phút. Có session/JWT → 422 GUEST_JWT_REJECTED
 * (dùng E2). Token MANAGE_BOOKING trả một lần; cancel không revoke.
 * Bước 2: OTP challenge lưu PostgreSQL; create bắt buộc proof + intent +
 * recoverySecret; resume/cancel/recovery dùng CheckoutRecoveryToken.
 */
@Controller('api/guest/bookings')
export class GuestBookingsController {
  constructor(
    private readonly guestHold: GuestCreateHoldUseCase,
    private readonly sendOtpUseCase: SendGuestOtpUseCase,
    private readonly verifyOtpUseCase: VerifyGuestOtpUseCase,
    private readonly resumeGuestIntent: ResumeGuestIntentUseCase,
    private readonly cancelGuestHold: CancelGuestHoldUseCase,
    private readonly getRecovery: GetGuestHoldRecoveryUseCase,
  ) {}

  @Post('send-otp')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'Gửi mã OTP xác thực email cho khách vãng lai' })
  async sendOtp(@Body() body: SendGuestOtpDto) {
    const result = await this.sendOtpUseCase.execute(body.email);
    return {
      success: true,
      message: 'Mã xác thực 6 chữ số đã được gửi tới email của bạn.',
      resendAfterSeconds: result.resendAfterSeconds,
      expiresAt: result.expiresAt,
    };
  }

  @Post('verify-otp')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'Xác thực mã OTP email khách vãng lai' })
  async verifyOtp(@Body() body: VerifyGuestOtpDto) {
    const result = await this.verifyOtpUseCase.execute(body);
    return {
      success: true,
      verified: true,
      message: 'Xác thực email thành công.',
      otpProof: result.otpProof,
      otpProofExpiresAt: result.otpProofExpiresAt,
    };
  }

  @Post('resume-intent')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'Task 2.2: khôi phục hold cũ bằng recoverySecret' })
  async resumeIntent(@Body() body: ResumeGuestIntentDto) {
    const result = await this.resumeGuestIntent.execute(body);
    return { success: true, data: result };
  }

  @Post(':bookingId/cancel-hold')
  @HttpCode(200)
  @UseGuards(GuestCheckoutTokenGuard)
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'Task 2.3: hủy giữ chỗ bằng checkout token' })
  async cancelHold(@Param('bookingId', ParseUUIDPipe) bookingId: string) {
    const result = await this.cancelGuestHold.execute(bookingId);
    return { success: true, data: result };
  }

  @Get(':bookingId/recovery')
  @UseGuards(GuestCheckoutTokenGuard)
  @Throttle({ default: { limit: 30, ttl: 300_000 } })
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'Task 3.2: snapshot phục hồi server-authoritative' })
  async recovery(@Param('bookingId', ParseUUIDPipe) bookingId: string) {
    const result = await this.getRecovery.execute(bookingId);
    return { success: true, data: result };
  }

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'E3: guest giữ sân 30% cọc + cấp token' })
  async create(@Req() request: Request, @Body() input: GuestCreateBookingDto) {
    if (
      request.header('authorization') ||
      (request.headers.cookie ?? '').includes('access_token=')
    ) {
      throw new BadRequestException({
        code: 'GUEST_JWT_REJECTED',
        message: 'Tài khoản đã đăng nhập — hãy đặt sân qua luồng E2.',
      });
    }
    const result = await this.guestHold.execute(input);
    return { success: true, data: result };
  }
}

/**
 * E13 — Staff cấp lại token cho booking guest (MIG-11).
 * Revoke token cũ chưa vô hiệu, phát hành mới, trả một lần. Yêu cầu booking
 * guest (userId NULL) và evidence claimant do operator xác minh ngoài hệ
 * thống (ghi chú vận hành bắt buộc).
 */
@Controller('api/staff/bookings')
@UseGuards(JwtAuthGuard, AuthCsrfGuard, RolesGuard)
@Roles(Role.STAFF, Role.MANAGER)
export class StaffGuestTokenController {
  constructor(
    private readonly tokens: GuestTokenService,
    private readonly prisma: PrismaService,
  ) {}

  @Post(':bookingId/issue-manage-token')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @ApiOperation({ summary: 'E13: cấp lại guest token (revoke cũ)' })
  async reissue(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() body: { reason: string },
  ) {
    if (typeof body?.reason !== 'string' || body.reason.trim().length < 8) {
      throw new BadRequestException(
        'Ghi rõ căn cứ xác minh người nhận (tối thiểu 8 ký tự).',
      );
    }
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, userId: true, startsAt: true },
    });
    if (!booking)
      return { success: false, error: { code: 'BOOKING_NOT_FOUND' } };
    if (booking.userId !== null) {
      throw new BadRequestException(
        'Booking có tài khoản — không cần guest token.',
      );
    }
    const live = await this.prisma.bookingAccessToken.findMany({
      where: {
        bookingId,
        purpose: 'MANAGE_BOOKING',
        revokedAt: null,
      },
      select: { id: true },
    });
    for (const token of live) {
      await this.tokens.revokeToken(token.id);
    }
    const issued = await this.tokens.issueManageToken({
      bookingId,
      startsAt: booking.startsAt,
    });
    return {
      success: true,
      data: {
        bookingId,
        accessToken: issued.rawToken,
        accessTokenExpiresAt: issued.expiresAt.toISOString(),
        revokedCount: live.length,
      },
    };
  }
}
