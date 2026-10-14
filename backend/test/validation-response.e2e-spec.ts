import 'reflect-metadata';
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
import { LoginDto } from '../src/modules/auth/dto/login.dto.js';
import { RegisterDto } from '../src/modules/auth/dto/register.dto.js';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard.js';
import { CourtsController } from '../src/modules/courts/courts.controller.js';
import { CourtsService } from '../src/modules/courts/courts.service.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const AUTH_COOKIE = 'access_token';
const LOGIN_PAYLOAD = { username: 'customer', password: 'Secret1!' };
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
  passwordHash: 'private-password-hash',
  tokenVersion: 7,
  profile: { fullName: PUBLIC_USER.fullName },
  roles: [{ role: 'CUSTOMER' }],
};
const PUBLIC_COURT_KEYS = [
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
    court: { findMany: jest.fn<() => Promise<unknown>>() },
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
        AuthService,
        CourtsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        {
          provide: ConfigService,
          useValue: new ConfigService({ NODE_ENV: 'test' }),
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext): boolean {
          const request = context.switchToHttp().getRequest<Request>();
          request.user = { userId: USER_ID };
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

  it('transforms register input and preserves the 201 response contract', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    const register = jest.spyOn(app.get(AuthService), 'register');
    const response = await postAuth('register', REGISTER_PAYLOAD);
    expect(response.status).toBe(201);
    expect(register.mock.calls[0]?.[0]).toBeInstanceOf(RegisterDto);
    expect(argon.hash).toHaveBeenCalledWith(REGISTER_PAYLOAD.password);
    expect(await response.json()).toEqual({
      success: true,
      message: 'Đăng ký tài khoản thành công',
      user: PUBLIC_USER,
    });
    expect(response.headers.get('set-cookie')).toContain(
      `${AUTH_COOKIE}=mock-signed-token`,
    );
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

  it.each(['empty database', 'unreachable database'])(
    'preserves the fallback courts contract for %s',
    async (scenario) => {
      if (scenario === 'unreachable database') {
        prismaMock.court.findMany.mockRejectedValue(
          new Error('mock database unavailable'),
        );
      }
      const response = await fetch(`${baseUrl}/api/courts`);
      const body: unknown = await response.json();
      expect(response.status).toBe(200);
      expect(body).toMatchObject({ success: true, data: expect.any(Array) });
      expect(getCourts(body)).toHaveLength(4);
      for (const court of getCourts(body)) {
        expect(Object.keys(court).sort()).toEqual(PUBLIC_COURT_KEYS);
      }
    },
  );

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
        branch: { phone: 'private-phone' },
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
      pricePerHour: 250000,
    });
  });

  it('documents the exact success schemas for every existing endpoint', () => {
    expect(document.paths).toMatchObject({
      '/api/auth/login': {
        post: { responses: { '200': jsonSchema('AuthResponseDto') } },
      },
      '/api/auth/register': {
        post: { responses: { '201': jsonSchema('AuthResponseDto') } },
      },
      '/api/auth/me': {
        get: { responses: { '200': jsonSchema('AuthSessionResponseDto') } },
      },
      '/api/auth/logout': {
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
    expect(schemaKeys('LogoutResponseDto')).toEqual(['message', 'success']);
    expect(schemaKeys('CourtsResponseDto')).toEqual(['data', 'success']);
    expect(schemaKeys('PublicCourtDto')).toEqual(PUBLIC_COURT_KEYS);
  });

  it('documents required request fields, lengths, and nested response arrays', () => {
    expect(document.components?.schemas).toMatchObject({
      LoginDto: {
        required: ['username', 'password'],
        properties: { username: { maxLength: 254 } },
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

  function postAuth(endpoint: string, payload: unknown): Promise<Response> {
    return fetch(`${baseUrl}/api/auth/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
