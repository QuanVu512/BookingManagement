import 'reflect-metadata';
import { SessionTokenSigner } from './ports/session-token-signer.js';
import { JwtSessionTokenSigner } from './infrastructure/jwt-session-token-signer.js';
import { AccountStore } from './ports/account-store.js';
import { PrismaAccountStore } from './infrastructure/prisma-account-store.js';
import { PasswordHasher } from './ports/password-hasher.js';
import { ArgonPasswordHasher } from './infrastructure/argon-password-hasher.js';
import { AuthCsrfService } from './services/auth-csrf.service.js';
import { AuthCookiePresenter } from './presentation/auth-cookie.presenter.js';
import { AuthController } from './auth.controller.js';
import { AuthRecoveryService } from './services/auth-recovery.service.js';
import { CompromisedPasswordService } from './services/compromised-password.service.js';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import argon from 'argon2';
import type { Response } from 'express';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { Role } from '../../enums/index.js';
import { AuthService } from './auth.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AuthSessionService } from './services/auth-session.service.js';

const SESSION_ID = '10000000-0000-4000-8000-000000000001';
const sessionsMock = {
  claims: jest.fn<(id: string, version: number) => object>((id, version) => ({
    sub: id,
    tokenVersion: version,
    jti: SESSION_ID,
  })),
  revoke: jest.fn<() => Promise<void>>(),
};

describe('AuthService.login', () => {
  const prismaMock = {
    user: {
      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    $transaction:
      jest.fn<
        (
          callback: (tx: {
            user: { create: () => Promise<unknown> };
          }) => Promise<unknown>,
        ) => Promise<unknown>
      >(),
  };
  const jwtServiceMock = {
    signAsync: jest.fn<(...args: unknown[]) => Promise<string>>(),
  };
  const configServiceMock = {
    get: jest.fn<(...args: unknown[]) => unknown>(),
  };

  let service: AuthController;

  beforeEach(async () => {
    jest.clearAllMocks();
    jwtServiceMock.signAsync.mockReset();
    prismaMock.user.findFirst.mockReset();
    prismaMock.user.findUnique.mockReset();
    prismaMock.user.create.mockReset();
    prismaMock.$transaction.mockReset();
    configServiceMock.get.mockReturnValue('test');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: AuthCsrfService, useValue: {} },
        {
          provide: AuthRecoveryService,
          useValue: { sendVerification: async () => undefined },
        },
        {
          provide: CompromisedPasswordService,
          useValue: { assertAllowed: async () => undefined },
        },
        AuthService,
        { provide: SessionTokenSigner, useClass: JwtSessionTokenSigner },
        { provide: AccountStore, useClass: PrismaAccountStore },
        { provide: PasswordHasher, useClass: ArgonPasswordHasher },
        AuthCookiePresenter,
        { provide: AuthSessionService, useValue: sessionsMock },
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = new AuthController(
      module.get(AuthService),
      module.get(AuthCsrfService),
      module.get(AuthRecoveryService),
      module.get(AuthCookiePresenter),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects an unverified account without issuing a session', async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      ...createActiveUser(),
      emailVerifiedAt: null,
    });
    jest.spyOn(argon, 'verify').mockResolvedValue(true);
    const response = createResponseMock();
    await expect(
      service.login(
        { username: 'customer', password: 'a long passphrase' },
        response,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(response.cookie).not.toHaveBeenCalled();
    expect(jwtServiceMock.signAsync).not.toHaveBeenCalled();
  });

  it('rejects a password beyond maximum before Argon verification', async () => {
    const verify = jest.spyOn(argon, 'verify');
    await expect(
      service.login(
        { username: 'customer', password: 'a'.repeat(129) },
        createResponseMock(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(verify).not.toHaveBeenCalled();
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a login request with a missing username or password', async () => {
    const response = createResponseMock();

    await expect(
      service.login(
        { username: '', password: 'test password phrase' },
        response,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.login({ username: 'customer', password: '' }, response),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  it('looks up the trimmed login value as username, email, or phone', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    await expect(
      service.login(
        {
          username: ' customer@example.com ',
          password: 'test password phrase',
        },
        createResponseMock(),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { username: 'customer@example.com' },
          { email: 'customer@example.com' },
          { phone: { in: ['customer@example.com'] } },
        ],
      },
      include: { profile: true, roles: true },
    });
  });

  it('verifies a dummy hash for an unknown account without issuing a token', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    const verifyPassword = jest.spyOn(argon, 'verify');

    await expect(
      service.login(
        { username: 'unknown', password: 'test password phrase' },
        createResponseMock(),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(verifyPassword).toHaveBeenCalledTimes(1);
    expect(jwtServiceMock.signAsync).not.toHaveBeenCalled();
  });

  it.each([
    [' 0912345678 ', '+84912345678'],
    ['+84912345678', '+84912345678'],
  ])(
    'looks up canonical and legacy phone values for %s',
    async (identifier, phone) => {
      prismaMock.user.findFirst.mockResolvedValue(null);
      await expect(
        service.login(
          { username: identifier, password: 'SecretPhrase1!' },
          createResponseMock(),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { username: identifier.trim() },
            { email: identifier.trim() },
            { phone: { in: [phone, '0912345678'] } },
          ],
        },
        include: { profile: true, roles: true },
      });
    },
  );

  it('normalizes an email login while retaining the username lookup', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    await expect(
      service.login(
        { username: ' CUSTOMER@EXAMPLE.COM ', password: 'SecretPhrase1!' },
        createResponseMock(),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { username: 'CUSTOMER@EXAMPLE.COM' },
          { email: 'customer@example.com' },
          { phone: { in: ['CUSTOMER@EXAMPLE.COM'] } },
        ],
      },
      include: { profile: true, roles: true },
    });
  });

  it('rejects an incorrect password without issuing a token or setting a cookie', async () => {
    prismaMock.user.findFirst.mockResolvedValue(createActiveUser());
    jest.spyOn(argon, 'verify').mockResolvedValue(false);
    const response = createResponseMock();

    await expect(
      service.login(
        { username: 'customer', password: 'wrong-password' },
        response,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(jwtServiceMock.signAsync).not.toHaveBeenCalled();
    expect(response.cookie.mock.calls).toHaveLength(0);
  });

  it('rejects an inactive account even when its password matches', async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      ...createActiveUser(),
      status: 'SUSPENDED',
    });
    jest.spyOn(argon, 'verify').mockResolvedValue(true);
    const response = createResponseMock();

    await expect(
      service.login(
        { username: 'customer', password: 'test password phrase' },
        response,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(jwtServiceMock.signAsync).not.toHaveBeenCalled();
    expect(response.cookie.mock.calls).toHaveLength(0);
  });

  it('returns the user, signs the role payload, and sets a production auth cookie', async () => {
    const user = {
      ...createActiveUser(),
      roles: [{ role: Role.STAFF }, { role: Role.MANAGER }],
    };
    prismaMock.user.findFirst.mockResolvedValue(user);
    jest.spyOn(argon, 'verify').mockResolvedValue(true);
    jwtServiceMock.signAsync.mockResolvedValue('signed-token');
    configServiceMock.get.mockReturnValue('production');
    const response = createResponseMock();

    const result = await service.login(
      { username: ' customer ', password: 'test password phrase' },
      response,
    );

    expect(jwtServiceMock.signAsync).toHaveBeenCalledWith(
      {
        sub: user.id,
        tokenVersion: user.tokenVersion,
        jti: SESSION_ID,
      },
      { expiresIn: '15m' },
    );
    expect(response.cookie.mock.calls).toEqual([
      [
        'access_token',
        'signed-token',
        {
          httpOnly: true,
          secure: true,
          sameSite: 'none',
          maxAge: 15 * 60 * 1000,
          path: '/',
        },
      ],
    ]);
    expect(result).toEqual({
      success: true,
      message: 'Đăng nhập thành công',
      user: {
        id: user.id,
        username: user.username,
        fullName: user.profile.fullName,
        email: user.email,
        phone: user.phone,
        roles: [Role.STAFF, Role.MANAGER],
        primaryRole: Role.MANAGER,
        isStaffOrAdmin: true,
      },
    });
  });
});

describe('AuthService.register', () => {
  const register = (
    input: Parameters<AuthService['register']>[0],
    _response: Response,
  ) => service.register(input);
  const prismaMock = {
    user: {
      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    $transaction:
      jest.fn<
        (
          callback: (tx: {
            user: { create: () => Promise<unknown> };
          }) => Promise<unknown>,
        ) => Promise<unknown>
      >(),
  };
  const jwtServiceMock = {
    signAsync: jest.fn<(...args: unknown[]) => Promise<string>>(),
  };
  const configServiceMock = { get: jest.fn<(...args: unknown[]) => unknown>() };
  let service: AuthController;

  afterEach(() => jest.restoreAllMocks());

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.user.findFirst.mockReset();
    prismaMock.user.findUnique.mockReset();
    prismaMock.user.create.mockReset();
    prismaMock.$transaction.mockReset();
    jwtServiceMock.signAsync.mockReset();
    configServiceMock.get.mockReturnValue('test');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: AuthCsrfService, useValue: {} },
        {
          provide: AuthRecoveryService,
          useValue: { sendVerification: async () => undefined },
        },
        {
          provide: CompromisedPasswordService,
          useValue: { assertAllowed: async () => undefined },
        },
        AuthService,
        { provide: SessionTokenSigner, useClass: JwtSessionTokenSigner },
        { provide: AccountStore, useClass: PrismaAccountStore },
        { provide: PasswordHasher, useClass: ArgonPasswordHasher },
        AuthCookiePresenter,
        { provide: AuthSessionService, useValue: sessionsMock },
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = new AuthController(
      module.get(AuthService),
      module.get(AuthCsrfService),
      module.get(AuthRecoveryService),
      module.get(AuthCookiePresenter),
    );
  });

  it('requires username, password, full name, email, and phone', async () => {
    await expect(
      register(
        {
          username: 'customer',
          password: 'test password phrase',
          confirmPassword: 'test password phrase',
          fullName: 'Test',
          email: 'test@example.com',
          phone: '',
        },
        createResponseMock(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  it('normalizes required account fields before checking duplicates', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback(prismaMock),
    );
    prismaMock.user.create.mockResolvedValue(createActiveUser());
    jest.spyOn(argon, 'hash').mockResolvedValue('hashed-password');
    jwtServiceMock.signAsync.mockResolvedValue('signed-token');

    await register(
      {
        username: ' customer ',
        password: 'test password phrase',
        confirmPassword: 'test password phrase',
        fullName: ' Test Customer ',
        email: ' CUSTOMER@EXAMPLE.COM ',
        phone: ' 0900000000 ',
      },
      createResponseMock(),
    );

    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { username: 'customer' },
          { email: 'customer@example.com' },
          { phone: { in: ['+84900000000', '0900000000'] } },
        ],
      },
    });
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: {
        username: 'customer',
        email: 'customer@example.com',
        phone: '+84900000000',
        passwordHash: 'hashed-password',
        status: 'ACTIVE',
        profile: { create: { fullName: 'Test Customer' } },
        roles: { create: { role: Role.CUSTOMER } },
      },
      include: { profile: true, roles: true },
    });
  });

  it('rejects a mismatch even when the service is called without the HTTP pipe', async () => {
    await expect(
      register(
        {
          username: 'customer',
          password: 'SecretPhrase1!',
          confirmPassword: 'Wrong1!',
          fullName: 'Test Customer',
          email: 'customer@example.com',
          phone: '0912345678',
        },
        createResponseMock(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('maps a concurrent private identifier conflict to generic response without issuing a token', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    jest.spyOn(argon, 'hash').mockResolvedValue('hashed-password');
    prismaMock.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('mock unique violation', {
        code: 'P2002',
        clientVersion: '7.10.0',
        meta: { target: ['phone'] },
      }),
    );
    await expect(
      register(
        {
          username: 'customer',
          password: 'SecretPhrase1!',
          confirmPassword: 'SecretPhrase1!',
          fullName: 'Test Customer',
          email: 'customer@example.com',
          phone: '0912345678',
        },
        createResponseMock(),
      ),
    ).resolves.toMatchObject({
      success: true,
      status: 'verification_required',
    });
    expect(jwtServiceMock.signAsync).not.toHaveBeenCalled();
  });

  it.each([
    [
      'username',
      { username: 'customer', email: 'other@example.com', phone: '0911111111' },
    ],
    [
      'email',
      { username: 'other', email: 'customer@example.com', phone: '0911111111' },
    ],
    [
      'phone',
      { username: 'other', email: 'other@example.com', phone: '0900000000' },
    ],
  ])(
    'rejects a duplicate %s without creating a user',
    async (_field, existingUser) => {
      prismaMock.user.findFirst.mockResolvedValue({
        id: 'existing-user',
        ...existingUser,
      });
      jest.spyOn(argon, 'hash').mockResolvedValue('hashed-password');
      const result = register(
        {
          username: 'customer',
          password: 'test password phrase',
          confirmPassword: 'test password phrase',
          fullName: 'Test',
          email: 'customer@example.com',
          phone: '0900000000',
        },
        createResponseMock(),
      );
      if (_field === 'username')
        await expect(result).rejects.toBeInstanceOf(ConflictException);
      else
        await expect(result).resolves.toMatchObject({
          success: true,
          status: 'verification_required',
        });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    },
  );
});

describe('AuthService.getMe and logout', () => {
  const prismaMock = {
    user: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };
  const jwtServiceMock = {
    signAsync: jest.fn<(...args: unknown[]) => Promise<string>>(),
  };
  const configServiceMock = { get: jest.fn<(...args: unknown[]) => unknown>() };
  let service: AuthController;

  beforeEach(async () => {
    prismaMock.user.findUnique.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: AuthCsrfService, useValue: {} },
        {
          provide: AuthRecoveryService,
          useValue: { sendVerification: async () => undefined },
        },
        {
          provide: CompromisedPasswordService,
          useValue: { assertAllowed: async () => undefined },
        },
        AuthService,
        { provide: SessionTokenSigner, useClass: JwtSessionTokenSigner },
        { provide: AccountStore, useClass: PrismaAccountStore },
        { provide: PasswordHasher, useClass: ArgonPasswordHasher },
        AuthCookiePresenter,
        { provide: AuthSessionService, useValue: sessionsMock },
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();
    service = new AuthController(
      module.get(AuthService),
      module.get(AuthCsrfService),
      module.get(AuthRecoveryService),
      module.get(AuthCookiePresenter),
    );
  });

  it('returns the active session with required account fields and resolved roles', async () => {
    const user = {
      ...createActiveUser(),
      roles: [{ role: Role.STAFF }],
    };
    prismaMock.user.findUnique.mockResolvedValue(user);

    await expect(service.getMe(user.id)).resolves.toEqual({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.profile.fullName,
        email: user.email,
        phone: user.phone,
        roles: [Role.STAFF],
        primaryRole: Role.STAFF,
        isStaffOrAdmin: true,
      },
    });
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: user.id },
      include: { profile: true, roles: true },
    });
  });

  it.each([
    ['missing', null],
    ['inactive', { ...createActiveUser(), status: 'SUSPENDED' }],
  ])('rejects a %s session', async (_state, user) => {
    prismaMock.user.findUnique.mockResolvedValue(user);
    await expect(service.getMe('user-1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('revokes the session before clearing the auth cookie on logout', async () => {
    const clearCookie = jest.fn();
    const response = { clearCookie } as unknown as Response;
    await expect(
      service.logout(
        {
          userId: 'user-1',
          username: 'customer',
          roles: [Role.CUSTOMER],
          jti: SESSION_ID,
          tokenVersion: 0,
          exp: Math.floor(Date.now() / 1000) + 900,
        },
        response,
      ),
    ).resolves.toEqual({
      success: true,
      message: 'Đăng xuất thành công',
    });
    expect(sessionsMock.revoke).toHaveBeenCalled();
    expect(clearCookie).toHaveBeenCalledWith('access_token', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });
  });

  it('does not clear the cookie or confirm logout when revocation fails', async () => {
    const response = { clearCookie: jest.fn() };
    sessionsMock.revoke.mockRejectedValueOnce(
      new Error('revocation unavailable'),
    );
    await expect(
      service.logout(
        {
          userId: 'user-1',
          username: 'customer',
          roles: [Role.CUSTOMER],
          jti: SESSION_ID,
          tokenVersion: 0,
          exp: Math.floor(Date.now() / 1000) + 900,
        },
        response as unknown as Response,
      ),
    ).rejects.toThrow('revocation unavailable');
    expect(response.clearCookie).not.toHaveBeenCalled();
  });
});

function createActiveUser() {
  return {
    id: 'user-1',
    username: 'customer',
    email: 'customer@example.com',
    phone: '+84900000000',
    passwordHash: 'hashed-password',
    status: 'ACTIVE',
    tokenVersion: 0,
    emailVerifiedAt: new Date(),
    profile: { fullName: 'Test Customer' },
    roles: [{ role: Role.CUSTOMER }],
  };
}

function createResponseMock(): Response & { cookie: jest.Mock } {
  return { cookie: jest.fn() } as unknown as Response & { cookie: jest.Mock };
}
