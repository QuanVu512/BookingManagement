import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import {
  AuthResponseDto,
  AuthSessionResponseDto,
  LogoutResponseDto,
} from './dto/auth-response.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    return this.authService.login(dto, res);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: AuthResponseDto })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    return this.authService.register(dto, res);
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
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LogoutResponseDto })
  async logout(
    @Res({ passthrough: true }) res: Response,
  ): Promise<LogoutResponseDto> {
    return this.authService.logout(res);
  }
}
