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

type AuthDatabaseUser = Prisma.UserGetPayload<{
  include: { profile: true; roles: true };
}>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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
    const publicUser = this.toPublicUser(user);
    await this.issueSession(publicUser, response);
    return { success: true, message: 'Đăng nhập thành công', user: publicUser };
  }

  async register(
    input: RegisterDto,
    response: Response,
  ): Promise<AuthResponseDto> {
    const dto = validateAuthInput(RegisterDto, input);
    await this.checkRegistrationConflict(dto);
    const passwordHash = await argon.hash(dto.password);
    const user = await this.createUser(dto, passwordHash);
    const publicUser = this.toPublicUser(user);
    await this.issueSession(publicUser, response);
    return {
      success: true,
      message: 'Đăng ký tài khoản thành công',
      user: publicUser,
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

  logout(response: Response): LogoutResponseDto {
    response.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
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
    response: Response,
  ): Promise<void> {
    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        username: user.username,
        roles: user.roles,
        primaryRole: user.primaryRole,
      },
      { expiresIn: AUTH_TOKEN_TTL },
    );
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    response.cookie(AUTH_COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: AUTH_COOKIE_MAX_AGE_MS,
      path: '/',
    });
  }
}
