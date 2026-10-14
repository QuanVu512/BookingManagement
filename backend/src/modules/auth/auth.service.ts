import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import argon from 'argon2';
import type { Response } from 'express';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import type {
  AuthResponseDto,
  AuthSessionResponseDto,
  AuthUserResponseDto,
  LogoutResponseDto,
} from './dto/auth-response.dto.js';
import { Role, UserStatus } from '../../enums/index.js';
import {
  AUTH_COOKIE_MAX_AGE_MS,
  AUTH_COOKIE_NAME,
  AUTH_TOKEN_TTL,
} from './constants/auth-validation.constants.js';
import {
  normalizeVietnamPhone,
  phoneLookupValues,
} from './helpers/auth-normalization.js';
import { validateAuthInput } from './helpers/validate-auth-input.js';
import { AuthSessionService } from './services/auth-session.service.js';
import type { AuthenticatedAccount } from './services/auth-session.service.js';
import { CompromisedPasswordService } from './services/compromised-password.service.js';
import { authCookieOptions } from './helpers/auth-cookie.js';
import { AuthRecoveryService } from './services/auth-recovery.service.js';
import type { RegistrationResponseDto } from './dto/auth-response.dto.js';

type AuthDatabaseUser = Prisma.UserGetPayload<{
  include: { profile: true; roles: true };
}>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly sessions: AuthSessionService,
    private readonly passwords: CompromisedPasswordService,
    private readonly recovery: AuthRecoveryService,
  ) {}

  async login(input: LoginDto, response: Response): Promise<AuthResponseDto> {
    const dto = validateAuthInput(LoginDto, input);
    const user = await this.findLoginUser(dto.username);
    if (!user || !(await argon.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException(
        'Tài khoản hoặc mật khẩu không chính xác.',
      );
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(
        'Tài khoản đang bị tạm khóa hoặc ngừng hoạt động.',
      );
    }
    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException(
        'Vui lòng xác minh email trước khi đăng nhập.',
      );
    }
    const publicUser = this.toPublicUser(user);
    await this.issueSession(publicUser, user.tokenVersion, response);
    return { success: true, message: 'Đăng nhập thành công', user: publicUser };
  }

  async register(
    input: RegisterDto,
    _response: Response,
  ): Promise<RegistrationResponseDto> {
    const dto = validateAuthInput(RegisterDto, input);
    await this.checkRegistrationConflict(dto);
    await this.passwords.assertAllowed(dto.password);
    const passwordHash = await argon.hash(dto.password);
    const user = await this.createUser(dto, passwordHash);
    await this.recovery.sendVerification({
      id: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
    });
    return {
      success: true,
      status: 'verification_required',
      message:
        'Tài khoản đã được tạo. Vui lòng kiểm tra email để xác minh trước khi đăng nhập.',
    };
  }

  async getMe(userId: string): Promise<AuthSessionResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, roles: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(
        'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
      );
    }
    return { success: true, user: this.toPublicUser(user) };
  }

  async logout(
    account: AuthenticatedAccount,
    response: Response,
  ): Promise<LogoutResponseDto> {
    await this.sessions.revoke(account);
    response.clearCookie(
      AUTH_COOKIE_NAME,
      authCookieOptions(this.configService),
    );
    return { success: true, message: 'Đăng xuất thành công' };
  }

  private async checkRegistrationConflict(dto: RegisterDto): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: dto.username },
          { email: dto.email },
          { phone: { in: phoneLookupValues(dto.phone) } },
        ],
      },
    });
    if (existing?.username === dto.username) {
      throw new ConflictException('Tên đăng nhập này đã được sử dụng.');
    }
    if (existing?.email === dto.email) {
      throw new ConflictException('Email này đã được sử dụng.');
    }
    if (existing && normalizeVietnamPhone(existing.phone) === dto.phone) {
      throw new ConflictException('Số điện thoại này đã được sử dụng.');
    }
  }

  private async createUser(
    dto: RegisterDto,
    passwordHash: string,
  ): Promise<AuthDatabaseUser> {
    try {
      return await this.prisma.$transaction((transaction) =>
        transaction.user.create({
          data: this.registrationUserData(dto, passwordHash),
          include: { profile: true, roles: true },
        }),
      );
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Tên đăng nhập, email hoặc số điện thoại đã được sử dụng.',
        );
      }
      throw error;
    }
  }

  private findLoginUser(identifier: string): Promise<AuthDatabaseUser | null> {
    return this.prisma.user.findFirst({
      where: {
        OR: [
          { username: identifier },
          { email: identifier.toLowerCase() },
          { phone: { in: phoneLookupValues(identifier) } },
        ],
      },
      include: { profile: true, roles: true },
    });
  }

  private registrationUserData(
    dto: RegisterDto,
    passwordHash: string,
  ): Prisma.UserCreateInput {
    return {
      username: dto.username,
      email: dto.email,
      phone: dto.phone,
      passwordHash,
      status: UserStatus.ACTIVE,
      profile: { create: { fullName: dto.fullName } },
      roles: { create: { role: Role.CUSTOMER } },
    };
  }

  private toPublicUser(user: AuthDatabaseUser): AuthUserResponseDto {
    const roles = user.roles.map((assignment) => assignment.role);
    return {
      id: user.id,
      username: user.username,
      fullName: user.profile?.fullName || user.username || 'Khách hàng',
      email: user.email,
      phone: user.phone,
      roles,
      primaryRole: this.determinePrimaryRole(roles),
      isStaffOrAdmin: [Role.ADMIN, Role.MANAGER, Role.STAFF].some((role) =>
        roles.includes(role),
      ),
    };
  }

  private determinePrimaryRole(roles: Role[]): Role {
    return (
      [Role.ADMIN, Role.MANAGER, Role.STAFF].find((role) =>
        roles.includes(role),
      ) ?? Role.CUSTOMER
    );
  }

  private async issueSession(
    user: AuthUserResponseDto,
    tokenVersion: number,
    response: Response,
  ): Promise<void> {
    const accessToken = await this.jwtService.signAsync(
      this.sessions.claims(user.id, tokenVersion),
      { expiresIn: AUTH_TOKEN_TTL },
    );
    response.cookie(AUTH_COOKIE_NAME, accessToken, {
      ...authCookieOptions(this.configService),
      maxAge: AUTH_COOKIE_MAX_AGE_MS,
    });
  }
}
