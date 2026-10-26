import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import {
  Controller,
  Get,
  HttpStatus,
  type INestApplication,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';

const PROBE_ROUTE = 'runtime-probe';
const THROTTLE_LIMIT = 2;
const THROTTLE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 5_000;
const EPHEMERAL_PORT = 0;
const LOOPBACK_HOST = '127.0.0.1';

@Controller(PROBE_ROUTE)
class RuntimeProbeController {
  @Get()
  probe() {
    return { ok: true };
  }
}

describe('Nest ESM and CommonJS plugin runtime interoperability', () => {
  let app: INestApplication | undefined;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          { ttl: THROTTLE_TTL_MS, limit: THROTTLE_LIMIT },
        ]),
      ],
      controllers: [RuntimeProbeController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(EPHEMERAL_PORT, LOOPBACK_HOST);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('serves real HTTP requests and enforces the real throttler guard', async () => {
    for (let attempt = 0; attempt < THROTTLE_LIMIT; attempt += 1) {
      const response = await fetch(`${baseUrl}/${PROBE_ROUTE}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      expect(response.status).toBe(HttpStatus.OK);
      expect(await response.json()).toEqual({ ok: true });
    }
    const blocked = await fetch(`${baseUrl}/${PROBE_ROUTE}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    expect(blocked.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await blocked.json()).toEqual(
      expect.objectContaining({ statusCode: HttpStatus.TOO_MANY_REQUESTS }),
    );
  });
});
