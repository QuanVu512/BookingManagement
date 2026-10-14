import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard.js';
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
  AuthTokenDto,
  ResetPasswordDto,
} from './dto/auth-recovery.dto.js';
import { RegistrationResponseDto } from './dto/auth-response.dto.js';

@Controller('api/auth')
@UseGuards(AuthCsrfGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly csrf: AuthCsrfService,
    private readonly recovery: AuthRecoveryService,
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
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    return this.authService.login(dto, res);
  }

  @Post('register')
  @UseGuards(AuthRateLimitGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: RegistrationResponseDto })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RegistrationResponseDto> {
    return this.authService.register(dto, res);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LogoutResponseDto })
  verifyEmail(@Body() dto: AuthTokenDto): Promise<LogoutResponseDto> {
    return this.recovery.verifyEmail(dto);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LogoutResponseDto })
  resendVerification(@Body() dto: AuthEmailDto): Promise<LogoutResponseDto> {
    return this.recovery.requestEmail(dto, 'verify-email');
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LogoutResponseDto })
  forgotPassword(@Body() dto: AuthEmailDto): Promise<LogoutResponseDto> {
    return this.recovery.requestEmail(dto, 'reset-password');
  }

  @Post('reset-password')
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
    return this.authService.logout(account, res);
  }
}
