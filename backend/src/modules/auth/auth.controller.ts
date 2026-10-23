import { AuthCookiePresenter } from './presentation/auth-cookie.presenter.js';
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard.js';
import { AuthRateLimit } from './decorators/auth-rate-policy.decorator.js';
import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import {
  AuthResponseDto,
  AuthSessionResponseDto,
  LogoutResponseDto,
  CsrfResponseDto,
} from './dto/auth-response.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import type { AuthenticatedAccount } from './services/auth-session.service.js';
import { AuthCsrfGuard } from './guards/auth-csrf.guard.js';
import { AuthCsrfService } from './services/auth-csrf.service.js';
import { AuthRecoveryService } from './services/auth-recovery.service.js';
import {
  AuthEmailDto,
  SendEmailOtpDto,
  VerifyEmailCodeDto,
  ResetPasswordDto,
} from './dto/auth-recovery.dto.js';
import { RegistrationResponseDto } from './dto/auth-response.dto.js';
import { EmailOtpService } from './services/email-otp.service.js';

@Controller('api/auth')
@UseGuards(AuthCsrfGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly csrf: AuthCsrfService,
    private readonly recovery: AuthRecoveryService,
    private readonly cookies: AuthCookiePresenter,
    private readonly otp: EmailOtpService,
  ) {}

  @Get('csrf')
  @ApiOkResponse({ type: CsrfResponseDto })
  csrfToken(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CsrfResponseDto> {
    return this.csrf.issue(request, response);
  }

  @Post('login')
  @AuthRateLimit('login')
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    return this.cookies.login(await this.authService.login(dto), res);
  }

  @Post('register')
  @AuthRateLimit('register')
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: RegistrationResponseDto })
  async register(@Body() dto: RegisterDto): Promise<RegistrationResponseDto> {
    return this.authService.register(dto);
  }

  @Post('verify-email')
  @AuthRateLimit('token')
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LogoutResponseDto })
  async verifyEmail(
    @Body() dto: VerifyEmailCodeDto,
  ): Promise<LogoutResponseDto> {
    await this.otp.verifyEmail(dto.email, dto.code);
    return {
      success: true,
      message: 'Email đã được xác minh. Bạn có thể đăng nhập.',
    };
  }

  @Post('resend-verification')
  @AuthRateLimit('recovery')
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LogoutResponseDto })
  resendVerification(@Body() dto: SendEmailOtpDto): Promise<LogoutResponseDto> {
    return this.recovery.sendEmailOtp(dto);
  }

  @Post('forgot-password')
  @AuthRateLimit('recovery')
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LogoutResponseDto })
  forgotPassword(@Body() dto: AuthEmailDto): Promise<LogoutResponseDto> {
    return this.recovery.requestEmail(dto, 'reset-password');
  }

  @Post('reset-password')
  @AuthRateLimit('token')
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LogoutResponseDto })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<LogoutResponseDto> {
    return this.recovery.resetPassword(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ type: AuthSessionResponseDto })
  async getMe(
    @CurrentUser('userId') userId: string,
  ): Promise<AuthSessionResponseDto> {
    return this.authService.getMe(userId);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LogoutResponseDto })
  async logout(
    @CurrentUser() account: AuthenticatedAccount,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LogoutResponseDto> {
    const result = await this.authService.logout(account);
    this.cookies.clear(res);
    return result;
  }
}
