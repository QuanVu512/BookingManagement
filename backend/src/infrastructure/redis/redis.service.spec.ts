import 'reflect-metadata';
import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { createServer, type Socket } from 'node:net';
import { RedisService } from './redis.service.js';
import { AuthRedisStore } from '../../modules/auth/services/auth-redis.store.js';

describe('Redis auth lifecycle', () => {
  it('handles error events without leaking error details and fails closed while disconnected', async () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const redis = new RedisService(
      new ConfigService({ REDIS_URL: 'redis://127.0.0.1:1' }),
    );
    try {
      expect(() =>
        redis.client.emit('error', new Error('SYNTHETIC_CREDENTIAL_MARKER')),
      ).not.toThrow();
      expect(JSON.stringify(error.mock.calls)).not.toContain(
        'SYNTHETIC_CREDENTIAL_MARKER',
      );
      await expect(
        new AuthRedisStore(redis).get('fixture'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    } finally {
      await redis.onApplicationShutdown();
      error.mockRestore();
    }
  });

  it('closes a stalled real TCP socket within budget without replaying a queued mutation', async () => {
    const sockets = new Set<Socket>();
    let stall = false;
    let mutations = 0;
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => undefined);
      socket.on('data', (data) => {
        if (data.toString().includes('GETDEL')) mutations++;
        if (!stall)
          socket.write(
            '+OK\r\n'.repeat(data.toString().match(/\*\d+\r\n/g)?.length ?? 1),
          );
      });
    });
    await new Promise<void>((resolveListen) =>
      server.listen(0, '127.0.0.1', resolveListen),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing test socket address');
    const redis = new RedisService(
      new ConfigService({ REDIS_URL: `redis://127.0.0.1:${address.port}` }),
    );
    try {
      await redis.onModuleInit();
      stall = true;
      const started = performance.now();
      await expect(
        new AuthRedisStore(redis).consume('fixture'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(performance.now() - started).toBeLessThan(3500);
      expect(mutations).toBe(1);
    } finally {
      await redis.onApplicationShutdown();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolveClose) =>
        server.close(() => resolveClose()),
      );
    }
  }, 10000);
});
