import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RedisService } from '../../../infrastructure/redis/redis.service.js';
import {
  BookingSlotLock,
  type SlotLockLease,
} from '../ports/booking-slot-lock.js';

const RELEASE_IF_OWNER = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end`;

/**
 * Redis `SET NX PX` adapter for the booking slot lock. The token is a
 * random UUID per acquisition so only the owner can release the key; the
 * TTL guarantees self-healing if a process crashes before `finally`.
 */
@Injectable()
export class RedisBookingSlotLock extends BookingSlotLock {
  private readonly logger = new Logger(RedisBookingSlotLock.name);

  constructor(@Optional() private readonly redis?: RedisService) {
    super();
  }

  async acquire(key: string, ttlMs: number): Promise<SlotLockLease | null> {
    if (!this.redis) {
      this.logger.warn(
        `Slot lock unavailable for ${key}; relying on DB exclusion constraint.`,
      );
      return { key, release: async () => undefined };
    }
    const token = randomUUID();
    const acquired = await this.redis.client.set(key, token, {
      NX: true,
      PX: ttlMs,
    });
    if (acquired !== 'OK') return null;
    let released = false;
    return {
      key,
      release: async () => {
        if (released) return;
        released = true;
        try {
          await this.redis?.client.eval(RELEASE_IF_OWNER, {
            keys: [key],
            arguments: [token],
          });
        } catch (error: unknown) {
          this.logger.warn(
            `Slot lock release failed for ${key}: ${(error as Error)?.message ?? error}`,
          );
        }
      },
    };
  }
}
