import 'reflect-metadata';
import { AccountStore } from '../src/modules/auth/ports/account-store.js';
import { PasswordHasher } from '../src/modules/auth/ports/password-hasher.js';
import { SessionTokenSigner } from '../src/modules/auth/ports/session-token-signer.js';
import { PrismaAccountStore } from '../src/modules/auth/infrastructure/prisma-account-store.js';
import { ArgonPasswordHasher } from '../src/modules/auth/infrastructure/argon-password-hasher.js';
import { JwtSessionTokenSigner } from '../src/modules/auth/infrastructure/jwt-session-token-signer.js';
import { AuthCookiePresenter } from '../src/modules/auth/presentation/auth-cookie.presenter.js';
import { AuthRecoveryService } from '../src/modules/auth/services/auth-recovery.service.js';
import { AuthRateLimitService } from '../src/modules/auth/services/auth-rate-limit.service.js';
import { AuthRateLimitGuard } from '../src/modules/auth/guards/auth-rate-limit.guard.js';
import { CompromisedPasswordService } from '../src/modules/auth/services/compromised-password.service.js';

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { ValidationPipe } from '@nestjs/common';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import type { Request } from 'express';
import argon from 'argon2';
import { REQUEST_VALIDATION_OPTIONS } from '../src/constants/validation.constants.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { AuthController } from '../src/modules/auth/auth.controller.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { AuthSessionService } from '../src/modules/auth/services/auth-session.service.js';
import { AuthCsrfService } from '../src/modules/auth/services/auth-csrf.service.js';
import { AuthCsrfGuard } from '../src/modules/auth/guards/auth-csrf.guard.js';
import { AuthRedisStore } from '../src/modules/auth/services/auth-redis.store.js';
import { LoginDto } from '../src/modules/auth/dto/login.dto.js';
import { RegisterDto } from '../src/modules/auth/dto/register.dto.js';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard.js';
import { CourtsService } from '../src/modules/courts/courts.service.js';
import { GetActiveCourtDetailUseCase } from '../src/modules/courts/application/get-active-court-detail.use-case.js';
import { ListActiveCourtsUseCase } from '../src/modules/courts/application/list-active-courts.use-case.js';
import { PrismaCourtReader } from '../src/modules/courts/infrastructure/prisma-court-reader.js';
import { CourtReader } from '../src/modules/courts/ports/court-reader.js';
import { CourtResponsePresenter } from '../src/modules/courts/presentation/court-response.presenter.js';
import { CourtsController } from '../src/modules/courts/presentation/courts.controller.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const AUTH_COOKIE = 'access_token';
const TEST_ORIGIN = 'http://localhost:4001';
const csrfEntries = new Map<string, string>();
const LOGIN_PAYLOAD = { username: 'customer', password: 'SecretPhrase1!' };
const REGISTER_PAYLOAD = {
  ...LOGIN_PAYLOAD,
  confirmPassword: LOGIN_PAYLOAD.password,
  fullName: 'Test Customer',
  email: 'customer@example.com',
  phone: '+84900000000',
};
const PUBLIC_USER = {
  id: USER_ID,
  username: 'customer',
  fullName: 'Test Customer',
  email: 'customer@example.com',
  phone: '+84900000000',
  roles: ['CUSTOMER'],
  primaryRole: 'CUSTOMER',
  isStaffOrAdmin: false,
};
const DATABASE_USER = {
  ...PUBLIC_USER,
  status: 'ACTIVE',
  emailVerifiedAt: new Date(),
  passwordHash: 'private-password-hash',
  tokenVersion: 7,
  profile: { fullName: PUBLIC_USER.fullName },
  roles: [{ role: 'CUSTOMER' }],
};
const PUBLIC_COURT_KEYS = [
  'timezone',
  'branchName',
  'address',
  'cleanupMinutes',
  'priceLabel',
  'id',
  'name',
  'code',
  'courtType',
  'status',
  'surfaceType',
  'features',
  'pricePerHour',
  'imageUrl',
  'rating',
  'reviewCount',
].sort();

describe('Auth/Courts HTTP validation and response contract (mock dependencies)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let document: OpenAPIObject;
  const createUser = jest.fn<() => Promise<unknown>>();
  const prismaMock = {
    user: {
      findFirst: jest.fn<() => Promise<unknown>>(),
      findUnique: jest.fn<() => Promise<unknown>>(),
    },
    court: {
      findMany: jest.fn<() => Promise<unknown>>(),
      findFirst: jest.fn<() => Promise<unknown>>(),
    },
    $transaction:
      jest.fn<
        (
          callback: (transaction: {
            user: { create: typeof createUser };
          }) => Promise<unknown>,
        ) => Promise<unknown>
      >(),
  };
  const jwtMock = { signAsync: jest.fn<() => Promise<string>>() };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [AuthController, CourtsController],
      providers: [
        {
          provide: AuthRecoveryService,
          useValue: { sendVerification: async () => undefined },
        },
        AuthRateLimitGuard,
        {
          provide: AuthRateLimitService,
          useValue: { check: async () => undefined },
        },
        {
          provide: CompromisedPasswordService,
          useValue: { assertAllowed: async () => undefined },
        },
        AuthService,
        AuthCookiePresenter,
        { provide: AccountStore, useClass: PrismaAccountStore },
        { provide: PasswordHasher, useClass: ArgonPasswordHasher },
        { provide: SessionTokenSigner, useClass: JwtSessionTokenSigner },
        {
          provide: AuthSessionService,
          useValue: {
            claims: () => ({
              sub: USER_ID,
              tokenVersion: 7,
              jti: '10000000-0000-4000-8000-000000000001',
            }),
            revoke: async () => undefined,
          },
        },
        ListActiveCourtsUseCase,
        GetActiveCourtDetailUseCase,
        CourtResponsePresenter,
        CourtsService,
        { provide: CourtReader, useClass: PrismaCourtReader },
        AuthCsrfService,
        AuthCsrfGuard,
        {
          provide: AuthRedisStore,
          useValue: {
            set: async (key: string, value: string) => {
              csrfEntries.set(key, value);
              return 'OK';
            },
            get: async (key: string) => csrfEntries.get(key) ?? null,
          },
        },
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            NODE_ENV: 'test',
            WEB_ORIGIN: TEST_ORIGIN,
          }),
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext): boolean {
          const request = context.switchToHttp().getRequest<Request>();
          request.user = {
            userId: USER_ID,
            jti: '10000000-0000-4000-8000-000000000001',
            tokenVersion: 7,
            exp: Math.floor(Date.now() / 1000) + 900,
          };
          return true;
        },
      })
      .compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(REQUEST_VALIDATION_OPTIONS));
    document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.user.findFirst.mockReset().mockResolvedValue(DATABASE_USER);
    prismaMock.user.findUnique.mockResolvedValue(DATABASE_USER);
    prismaMock.court.findMany.mockReset().mockResolvedValue([]);
    prismaMock.court.findFirst.mockReset().mockResolvedValue(null);
    createUser.mockResolvedValue(DATABASE_USER);
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback({ user: { create: createUser } }),
    );
    jwtMock.signAsync.mockResolvedValue('mock-signed-token');
    jest.spyOn(argon, 'verify').mockResolvedValue(true);
    jest.spyOn(argon, 'hash').mockResolvedValue('mock-password-hash');
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    if (app) await app.close();
  });

  it.each([
    ['login', {}],
    ['login', { ...LOGIN_PAYLOAD, username: 42 }],
    ['login', { ...LOGIN_PAYLOAD, password: null }],
    ['login', { ...LOGIN_PAYLOAD, unexpected: 'value' }],
    ['register', {}],
    ['register', { ...REGISTER_PAYLOAD, email: 'invalid-email' }],
    ['register', { ...REGISTER_PAYLOAD, phone: 123 }],
    ['register', { ...REGISTER_PAYLOAD, username: 'a'.repeat(101) }],
    ['register', { ...REGISTER_PAYLOAD, roles: ['ADMIN'] }],
    ['register', { ...REGISTER_PAYLOAD, confirmPassword: undefined }],
    ['register', { ...REGISTER_PAYLOAD, confirmPassword: 'Mismatch1!' }],
    [
      'register',
      { ...REGISTER_PAYLOAD, password: 'mậtkhẩu', confirmPassword: 'mậtkhẩu' },
    ],
    ['register', { ...REGISTER_PAYLOAD, username: '12345678' }],
    ['register', { ...REGISTER_PAYLOAD, phone: '+12025550123' }],
  ])(
    'rejects invalid %s input before calling dependencies: %j',
    async (endpoint, payload) => {
      const response = await postAuth(endpoint, payload);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
      });
      expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(jwtMock.signAsync).not.toHaveBeenCalled();
      expect(argon.verify).not.toHaveBeenCalled();
      expect(argon.hash).not.toHaveBeenCalled();
      expect(response.headers.get('set-cookie')).toBeNull();
    },
  );

  it('transforms login input, preserves the response, and keeps the token in the cookie', async () => {
    const login = jest.spyOn(app.get(AuthService), 'login');
    const response = await postAuth('login', LOGIN_PAYLOAD);
    expect(response.status).toBe(200);
    expect(login.mock.calls[0]?.[0]).toBeInstanceOf(LoginDto);
    expect(argon.verify).toHaveBeenCalledWith(
      DATABASE_USER.passwordHash,
      LOGIN_PAYLOAD.password,
    );
    expect(await response.json()).toEqual({
      success: true,
      message: 'Đăng nhập thành công',
      user: PUBLIC_USER,
    });
    expect(response.headers.get('set-cookie')).toContain(
      `${AUTH_COOKIE}=mock-signed-token`,
    );
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    login.mockRestore();
  });

  it('rejects an auth mutation without CSRF before checking credentials', async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(LOGIN_PAYLOAD),
    });
    expect(response.status).toBe(403);
    expect(argon.verify).not.toHaveBeenCalled();
  });

  it('transforms register input and returns pending verification without a session', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    const register = jest.spyOn(app.get(AuthService), 'register');
    const response = await postAuth('register', REGISTER_PAYLOAD);
    expect(response.status).toBe(201);
    expect(register.mock.calls[0]?.[0]).toBeInstanceOf(RegisterDto);
    expect(argon.hash).toHaveBeenCalledWith(REGISTER_PAYLOAD.password);
    expect(await response.json()).toEqual({
      success: true,
      status: 'verification_required',
      message:
        'Nếu thông tin phù hợp, hướng dẫn xác minh sẽ được gửi qua email. Nếu chưa nhận được, hãy dùng chức năng gửi lại hoặc kiểm tra thông tin đăng ký.',
    });
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(jwtMock.signAsync).not.toHaveBeenCalled();
    register.mockRestore();
  });

  it('preserves the me response without exposing persistence fields', async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, user: PUBLIC_USER });
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: USER_ID },
      include: { profile: true, roles: true },
    });
  });

  it('preserves logout response and clears the auth cookie', async () => {
    const response = await postAuth('logout', {});
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      message: 'Đăng xuất thành công',
    });
    expect(response.headers.get('set-cookie')).toContain(`${AUTH_COOKIE}=;`);
  });

  it('returns an empty catalog for an empty database', async () => {
    const response = await fetch(baseUrl + '/api/courts');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: [] });
  });
  it('returns an HTTP error when the database is unavailable', async () => {
    prismaMock.court.findMany.mockRejectedValue(
      new Error('mock database unavailable'),
    );
    const response = await fetch(baseUrl + '/api/courts');
    expect(response.status).toBe(500);
    expect(await response.json()).not.toHaveProperty('data');
  });

  it('maps database courts to public DTO fields without exposing relations', async () => {
    prismaMock.court.findMany.mockResolvedValue([
      {
        id: 'court-db-1',
        name: 'Database Court',
        code: 'VIP-01',
        courtType: 'VIP',
        status: 'ACTIVE',
        branchId: 'private-branch-id',
        cleanupMinutes: 15,
        branch: {
          phone: 'private-phone',
          name: 'Test branch',
          address: 'Public address',
          timezone: 'Asia/Ho_Chi_Minh',
          businessHours: [],
        },
        priceRules: [],
      },
    ]);
    const response = await fetch(`${baseUrl}/api/courts`);
    const courts = getCourts(await response.json());
    expect(response.status).toBe(200);
    expect(courts).toHaveLength(1);
    expect(Object.keys(courts[0]).sort()).toEqual(PUBLIC_COURT_KEYS);
    expect(courts[0]).toMatchObject({
      id: 'court-db-1',
      courtType: 'VIP',
      pricePerHour: 0,
    });
  });

  it('returns the active court detail with no-store and no private relations', async () => {
    const courtId = '00000000-0000-4000-8000-000000000010';
    prismaMock.court.findFirst.mockResolvedValue({
      id: courtId,
      name: 'Database Court',
      code: 'VIP-01',
      courtType: 'VIP',
      status: 'ACTIVE',
      branchId: 'private-branch-id',
      cleanupMinutes: 15,
      branch: {
        phone: 'private-phone',
        name: 'Test branch',
        address: 'Public address',
        timezone: 'Asia/Ho_Chi_Minh',
        businessHours: [],
      },
      priceRules: [],
    });
    const response = await fetch(`${baseUrl}/api/courts/${courtId}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as {
      success: boolean;
      data: Record<string, unknown>;
    };
    expect(body.success).toBe(true);
    expect(Object.keys(body.data).sort()).toEqual(PUBLIC_COURT_KEYS);
    expect(body.data).toMatchObject({ id: courtId, pricePerHour: 0 });
    expect(body.data).not.toHaveProperty('branch');
    expect(body.data).not.toHaveProperty('priceRules');
  });

  it('returns 404 for an inactive or missing court detail', async () => {
    const response = await fetch(
      `${baseUrl}/api/courts/00000000-0000-4000-8000-000000000011`,
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      statusCode: 404,
      message: 'Không tìm thấy sân đang hoạt động.',
    });
  });

  it('rejects a non-UUID detail before querying persistence', async () => {
    const response = await fetch(`${baseUrl}/api/courts/not-a-uuid`);
    expect(response.status).toBe(400);
    expect(prismaMock.court.findFirst).not.toHaveBeenCalled();
  });

  it('documents the exact success schemas for every existing endpoint', () => {
    expect(document.paths).toMatchObject({
      '/api/auth/login': {
        post: { responses: { '200': jsonSchema('AuthResponseDto') } },
      },
      '/api/auth/register': {
        post: { responses: { '201': jsonSchema('RegistrationResponseDto') } },
      },
      '/api/auth/me': {
        get: { responses: { '200': jsonSchema('AuthSessionResponseDto') } },
      },
      '/api/auth/logout': {
        post: { responses: { '200': jsonSchema('LogoutResponseDto') } },
      },
      '/api/auth/csrf': {
        get: { responses: { '200': jsonSchema('CsrfResponseDto') } },
      },
      '/api/auth/verify-email': {
        post: { responses: { '200': jsonSchema('LogoutResponseDto') } },
      },
      '/api/auth/resend-verification': {
        post: { responses: { '200': jsonSchema('LogoutResponseDto') } },
      },
      '/api/auth/forgot-password': {
        post: { responses: { '200': jsonSchema('LogoutResponseDto') } },
      },
      '/api/auth/reset-password': {
        post: { responses: { '200': jsonSchema('LogoutResponseDto') } },
      },
      '/api/courts': {
        get: { responses: { '200': jsonSchema('CourtsResponseDto') } },
      },
    });
    expect(schemaKeys('AuthUserResponseDto')).toEqual(
      Object.keys(PUBLIC_USER).sort(),
    );
    expect(schemaKeys('AuthResponseDto')).toEqual([
      'message',
      'success',
      'user',
    ]);
    expect(schemaKeys('AuthSessionResponseDto')).toEqual(['success', 'user']);
    expect(schemaKeys('RegistrationResponseDto')).toEqual([
      'message',
      'status',
      'success',
    ]);
    expect(schemaKeys('LogoutResponseDto')).toEqual(['message', 'success']);
    expect(schemaKeys('CourtsResponseDto')).toEqual(['data', 'success']);
    expect(schemaKeys('PublicCourtDto')).toEqual(PUBLIC_COURT_KEYS);
  });

  it('documents required request fields, lengths, and nested response arrays', () => {
    expect(document.components?.schemas).toMatchObject({
      LoginDto: {
        required: ['username', 'password'],
        properties: {
          username: { maxLength: 254 },
          password: { minLength: 12, maxLength: 128, writeOnly: true },
        },
      },
      AuthEmailDto: {
        required: ['email'],
        properties: { email: { format: 'email', maxLength: 254 } },
      },
      AuthTokenDto: {
        required: ['token'],
        properties: {
          token: { minLength: 64, maxLength: 64, writeOnly: true },
        },
      },
      ResetPasswordDto: {
        required: ['token', 'password', 'confirmPassword'],
        properties: {
          password: { minLength: 12, maxLength: 128, writeOnly: true },
          confirmPassword: { minLength: 12, maxLength: 128, writeOnly: true },
        },
      },
      RegisterDto: {
        required: [
          'username',
          'password',
          'confirmPassword',
          'fullName',
          'email',
          'phone',
        ],
        properties: {
          username: { maxLength: 100 },
          fullName: { maxLength: 150 },
          email: { format: 'email', maxLength: 254 },
          phone: { maxLength: 20 },
        },
      },
      AuthUserResponseDto: {
        properties: {
          roles: {
            type: 'array',
            items: { $ref: '#/components/schemas/Role' },
          },
        },
      },
      CourtsResponseDto: {
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/PublicCourtDto' },
          },
        },
      },
      PublicCourtDto: {
        properties: { features: { type: 'array', items: { type: 'string' } } },
      },
    });
  });

  async function postAuth(
    endpoint: string,
    payload: unknown,
  ): Promise<Response> {
    const csrf = await fetch(`${baseUrl}/api/auth/csrf`);
    const issued: { token: string } = await csrf.json();
    const cookie = csrf.headers.get('set-cookie')?.split(';')[0] ?? '';
    return fetch(`${baseUrl}/api/auth/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: TEST_ORIGIN,
        'X-CSRF-Token': issued.token,
        Cookie: cookie,
      },
      body: JSON.stringify(payload),
    });
  }

  function schemaKeys(name: string): string[] {
    const schema = document.components?.schemas?.[name];
    if (!schema || !('properties' in schema))
      throw new Error(`Missing schema: ${name}`);
    return Object.keys(schema.properties ?? {}).sort();
  }
});

function jsonSchema(name: string) {
  return {
    content: {
      'application/json': { schema: { $ref: `#/components/schemas/${name}` } },
    },
  };
}

function getCourts(body: unknown): Record<string, unknown>[] {
  if (
    !body ||
    typeof body !== 'object' ||
    !('data' in body) ||
    !Array.isArray(body.data)
  ) {
    throw new Error('Expected courts response');
  }
  return body.data.map((court: unknown) => {
    if (!court || typeof court !== 'object' || Array.isArray(court))
      throw new Error('Expected court object');
    return Object.fromEntries(Object.entries(court));
  });
}
