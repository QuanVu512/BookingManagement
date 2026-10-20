import {
  Injectable,
  ConflictException,
} from '@nestjs/common';import { SessionTokenSigner } from './ports/session-token-signer.js';
import { PasswordHasher } from './ports/password-hasher.js';
import {
  AccountStore,
  AccountConflictError,
  type AuthAccount,
} from './ports/account-store.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import type {
  AuthSessionResponseDto,
  AuthUserResponseDto,
  LogoutResponseDto,
} from './dto/auth-response.dto.js';
import { Role, UserStatus } from '../../enums/index.js';
import {
  AUTH_DUMMY_PASSWORD_HASH,
  AUTH_ERROR_CODES,
  AUTH_REGISTRATION_MESSAGE,
  AUTH_RECOVERY_RESPONSE_MS,
} from './constants/auth-validation.constants.js';
import { authError } from './helpers/auth-error.js';
import { validateAuthInput } from './helpers/validate-auth-input.js';
import { AuthSessionService } from './services/auth-session.service.js';
import type { AuthenticatedAccount } from './services/auth-session.service.js';
import { CompromisedPasswordService } from './services/compromised-password.service.js';
import type { LoginResult } from './application/auth-results.js';
import { AuthRecoveryService } from './services/auth-recovery.service.js';
import type { RegistrationResponseDto } from './dto/auth-response.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly accounts: AccountStore,
    private readonly hasher: PasswordHasher,
    private readonly signer: SessionTokenSigner,
    private readonly sessions: AuthSessionService,
    private readonly passwords: CompromisedPasswordService,
    private readonly recovery: AuthRecoveryService,
  ) {}

  async login(input: LoginDto): Promise<LoginResult> {
    const dto = validateAuthInput(LoginDto, input);
    const user = await this.accounts.findByIdentifier(dto.username);
    const valid = await this.hasher.verify(
      user?.passwordHash ?? AUTH_DUMMY_PASSWORD_HASH,
      dto.password,
    );
    this.assertCanLogin(user, valid);
    const publicUser = this.toPublicUser(user);
    const accessToken = await this.issueSession(publicUser, user.tokenVersion);
    return {
      accessToken,
      body: {
        success: true,
        message: 'Đăng nhập thành công',
        user: publicUser,
      },
    };
  }

  private assertCanLogin(
    user: AuthAccount | null,
    valid: boolean,
  ): asserts user is AuthAccount {
    if (!user || !valid) {
      throw authError(
        401,
        AUTH_ERROR_CODES.invalidCredentials,
        'Tài khoản hoặc mật khẩu không chính xác.',
      );
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw authError(
        401,
        AUTH_ERROR_CODES.invalidCredentials,
        'Tài khoản đang bị tạm khóa hoặc ngừng hoạt động.',
      );
    }
    if (!user.emailVerifiedAt) {
      throw authError(
        401,
        AUTH_ERROR_CODES.emailVerificationRequired,
        'Vui lòng xác minh email trước khi đăng nhập.',
      );
    }
  }

  async register(input: RegisterDto): Promise<RegistrationResponseDto> {
    const dto = validateAuthInput(RegisterDto, input);
    const started = performance.now();
    try {
      return await this.registerValidated(dto);
    } finally {
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.max(
            0,
            AUTH_RECOVERY_RESPONSE_MS - (performance.now() - started),
          ),
        ),
      );
    }
  }

  private async registerValidated(
    dto: RegisterDto,
  ): Promise<RegistrationResponseDto> {
    await this.passwords.assertAllowed(dto.password);
    const passwordHash = await this.hasher.hash(dto.password);
    const conflict = await this.checkRegistrationConflict(dto);
    if (!conflict) await this.registerNewAccount(dto, passwordHash);
    return {
      success: true,
      status: 'verification_required',
      message: AUTH_REGISTRATION_MESSAGE,
    };
  }

  async getMe(userId: string): Promise<AuthSessionResponseDto> {
    const user = await this.accounts.findById(userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw authError(
        401,
        AUTH_ERROR_CODES.sessionExpired,
        'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
      );
    }
    return { success: true, user: this.toPublicUser(user) };
  }

  async logout(account: AuthenticatedAccount): Promise<LogoutResponseDto> {
    await this.sessions.revoke(account);
    return { success: true, message: 'Đăng xuất thành công' };
  }

  private async checkRegistrationConflict(dto: RegisterDto): Promise<boolean> {
    const existing = await this.accounts.findConflict(dto);
    if (existing?.username === dto.username) {
      throw new ConflictException('Tên đăng nhập này đã được sử dụng.');
    }
    return Boolean(existing);
  }

  private async registerNewAccount(
    dto: RegisterDto,
    passwordHash: string,
  ): Promise<void> {
    try {
      const user = await this.accounts.create(dto, passwordHash);
      await this.recovery.sendVerification({
        id: user.id,
        email: user.email,
        tokenVersion: user.tokenVersion,
      });
    } catch (error) {
      if (error instanceof AccountConflictError) {
        await this.checkRegistrationConflict(dto);
        return;
      }
      throw error;
    }
  }

  private toPublicUser(user: AuthAccount): AuthUserResponseDto {
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

  private issueSession(
    user: AuthUserResponseDto,
    tokenVersion: number,
  ): Promise<string> {
    return this.signer.sign(user.id, tokenVersion);
  }
}
