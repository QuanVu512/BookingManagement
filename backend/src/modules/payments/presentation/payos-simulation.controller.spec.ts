import 'reflect-metadata';
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { Test } from '@nestjs/testing';
import {
  UnauthorizedException,
  ForbiddenException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { PayosSimulationController } from './payos-simulation.controller.js';
import { DemoPaymentAccessGuard } from '../infrastructure/demo-payment-access.guard.js';
import { GuestTokenGuard } from '../infrastructure/guest-token.guard.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { AuthCsrfGuard } from '../../auth/guards/auth-csrf.guard.js';
import { SimulateDemoPaymentUseCase } from '../application/simulate-demo-payment.use-case.js';

const requestId = '11111111-1111-4111-8111-111111111111';
const bookingId = '22222222-2222-4222-8222-222222222222';
const result = { eventId: 'event-demo', status: 'processed', outcome: null };
const simulate = {
  execute: jest.fn(async () => result),
  executeForOrderCode: jest.fn(async () => result),
};
let app: INestApplication;
let origin: string;

function httpRequest(context: ExecutionContext) {
  return context.switchToHttp().getRequest<{
    headers: Record<string, string>;
    body: { bookingId?: string };
    user?: { userId: string };
    guestBookingId?: string;
  }>();
}

describe('POST /api/webhooks/payos/simulate HTTP contract', () => {
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PayosSimulationController],
      providers: [
        DemoPaymentAccessGuard,
        { provide: SimulateDemoPaymentUseCase, useValue: simulate },
        {
          provide: JwtAuthGuard,
          useValue: {
            canActivate: async (context: ExecutionContext) => {
              const request = httpRequest(context);
              if (request.headers.authorization !== 'Bearer demo-owner')
                throw new UnauthorizedException();
              request.user = { userId: 'member-owner' };
              return true;
            },
          },
        },
        {
          provide: AuthCsrfGuard,
          useValue: {
            canActivate: async (context: ExecutionContext) => {
              if (httpRequest(context).headers['x-csrf-token'] !== 'demo-csrf')
                throw new ForbiddenException();
              return true;
            },
          },
        },
        {
          provide: GuestTokenGuard,
          useValue: {
            canActivate: async (context: ExecutionContext) => {
              const request = httpRequest(context);
              if (
                request.headers['x-booking-access-token'] !== 'guest-owner' ||
                request.body.bookingId !== bookingId
              )
                throw new UnauthorizedException();
              request.guestBookingId = bookingId;
              return true;
            },
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => jest.clearAllMocks());

  async function post(body: unknown, headers: Record<string, string> = {}) {
    return fetch(origin + '/api/webhooks/payos/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }
  const memberHeaders = {
    Authorization: 'Bearer demo-owner',
    'X-CSRF-Token': 'demo-csrf',
  };

  it('routes orderCode with member identity and no-store response', async () => {
    const response = await post({ orderCode: 123456 }, memberHeaders);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, private');
    expect(simulate.executeForOrderCode).toHaveBeenCalledWith(123456, {
      userId: 'member-owner',
      guestBookingId: undefined,
    });
  });
  it('supports requestId for restored checkout requests', async () => {
    expect((await post({ requestId }, memberHeaders)).status).toBe(200);
    expect(simulate.execute).toHaveBeenCalledWith(requestId, {
      userId: 'member-owner',
      guestBookingId: undefined,
    });
  });
  it('routes scoped guest identity without JWT or cookie CSRF', async () => {
    expect(
      (
        await post(
          { requestId, bookingId },
          { 'X-Booking-Access-Token': 'guest-owner' },
        )
      ).status,
    ).toBe(200);
    expect(simulate.execute).toHaveBeenCalledWith(requestId, {
      userId: null,
      guestBookingId: bookingId,
    });
  });
  it('rejects unauthenticated calls before simulation', async () => {
    expect((await post({ requestId })).status).toBe(401);
    expect(simulate.execute).not.toHaveBeenCalled();
  });
  it('rejects member calls without CSRF', async () => {
    expect(
      (await post({ requestId }, { Authorization: 'Bearer demo-owner' }))
        .status,
    ).toBe(403);
    expect(simulate.execute).not.toHaveBeenCalled();
  });
  it('rejects a guest token bound to a different booking even with a member cookie', async () => {
    expect(
      (
        await post(
          { requestId, bookingId: requestId },
          { ...memberHeaders, 'X-Booking-Access-Token': 'guest-owner' },
        )
      ).status,
    ).toBe(401);
    expect(simulate.execute).not.toHaveBeenCalled();
  });
  it('rejects malformed input and client-supplied amounts', async () => {
    for (const body of [
      {},
      { orderCode: 0 },
      { orderCode: 1.5 },
      { orderCode: '123' },
      { requestId: 'not-uuid' },
      { requestId, amount: 1 },
    ]) {
      expect((await post(body, memberHeaders)).status).toBe(400);
    }
    expect(simulate.execute).not.toHaveBeenCalled();
    expect(simulate.executeForOrderCode).not.toHaveBeenCalled();
  });
});
