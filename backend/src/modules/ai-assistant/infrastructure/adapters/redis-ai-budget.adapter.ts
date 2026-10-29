import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../../infrastructure/redis/redis.service.js';
import {
  AI_BUDGET_KEY_PREFIX,
  AI_RESERVATION_KEY_PREFIX,
} from '../../ai-assistant.constants.js';
import type {
  AiBudgetManagerPort,
  AiBudgetReserveInput,
  AiBudgetReserveResult,
  AiBudgetSettleInput,
  AiBudgetSettleResult,
} from '../../application/ports/ai-budget-manager.port.js';

const RESERVE_LUA = `
local quotaKey = KEYS[1]
local resKey = KEYS[2]
local reserveTokens = tonumber(ARGV[1])
local quotaLimit = tonumber(ARGV[2])
local bucketDate = ARGV[3]
local used = tonumber(redis.call('GET', quotaKey) or '0')
if used + reserveTokens > quotaLimit then
  return 0
end
redis.call('INCRBY', quotaKey, reserveTokens)
redis.call('HSET', resKey, 'status', 'RESERVED', 'reservedTokens', reserveTokens, 'bucketDate', bucketDate)
return 1
`;

const SETTLE_LUA = `
local quotaKey = KEYS[1]
local resKey = KEYS[2]
local actualTokens = tonumber(ARGV[1])
local status = redis.call('HGET', resKey, 'status')
if status ~= 'RESERVED' then
  return {0, 0}
end
local reservedTokens = tonumber(redis.call('HGET', resKey, 'reservedTokens') or '0')
local delta = reservedTokens - actualTokens
if delta < 0 then delta = 0 end
if delta > 0 then
  redis.call('DECRBY', quotaKey, delta)
end
redis.call('HSET', resKey, 'status', 'SETTLED')
return {1, delta}
`;

interface MemoryReservation {
  status: 'RESERVED' | 'SETTLED' | 'HELD_CONSERVATIVE';
  reservedTokens: number;
  bucketDate: string;
}

@Injectable()
export class RedisAiBudgetAdapter implements AiBudgetManagerPort {
  private readonly logger = new Logger(RedisAiBudgetAdapter.name);
  private readonly memoryUsed = new Map<string, number>();
  private readonly memoryReservations = new Map<string, MemoryReservation>();

  constructor(private readonly redis: RedisService) {}

  private quotaKey(bucketDate: string): string {
    return `${AI_BUDGET_KEY_PREFIX}${bucketDate}`;
  }

  private reservationKey(reservationId: string): string {
    return `${AI_RESERVATION_KEY_PREFIX}${reservationId}`;
  }

  async reserve(input: AiBudgetReserveInput): Promise<AiBudgetReserveResult> {
    try {
      const allowed = await this.redis.client.eval(RESERVE_LUA, {
        keys: [
          this.quotaKey(input.bucketDate),
          this.reservationKey(input.reservationId),
        ],
        arguments: [
          String(input.reserveTokens),
          String(input.quotaLimit),
          input.bucketDate,
        ],
      });
      return { allowed: Number(allowed) === 1 };
    } catch {
      this.logger.warn('Redis reserve unavailable, using memory fallback.');
      return { allowed: this.reserveInMemory(input) };
    }
  }

  async settle(input: AiBudgetSettleInput): Promise<AiBudgetSettleResult> {
    const reservation = this.memoryReservations.get(input.reservationId);
    if (reservation && reservation.status !== 'RESERVED') {
      return { settled: false, refundedTokens: 0 };
    }
    try {
      const bucketDate = reservation?.bucketDate ?? '';
      const result = (await this.redis.client.eval(SETTLE_LUA, {
        keys: [
          this.quotaKey(bucketDate),
          this.reservationKey(input.reservationId),
        ],
        arguments: [String(input.actualTokens)],
      })) as [number, number];
      const settled = Number(result[0]) === 1;
      const refundedTokens = Number(result[1] ?? 0);
      if (settled && reservation) {
        reservation.status = 'SETTLED';
      }
      return { settled, refundedTokens };
    } catch {
      this.logger.warn('Redis settle unavailable, using memory fallback.');
      return this.settleInMemory(input);
    }
  }

  async markConservativeHeld(reservationId: string): Promise<void> {
    const reservation = this.memoryReservations.get(reservationId);
    if (reservation) {
      reservation.status = 'HELD_CONSERVATIVE';
    }
    try {
      await this.redis.client.hSet(
        this.reservationKey(reservationId),
        'status',
        'HELD_CONSERVATIVE',
      );
    } catch {
      this.logger.warn('Redis held-mark unavailable, kept memory state.');
    }
  }

  private reserveInMemory(input: AiBudgetReserveInput): boolean {
    const used = this.memoryUsed.get(input.bucketDate) ?? 0;
    if (used + input.reserveTokens > input.quotaLimit) {
      return false;
    }
    this.memoryUsed.set(input.bucketDate, used + input.reserveTokens);
    this.memoryReservations.set(input.reservationId, {
      status: 'RESERVED',
      reservedTokens: input.reserveTokens,
      bucketDate: input.bucketDate,
    });
    return true;
  }

  private settleInMemory(input: AiBudgetSettleInput): AiBudgetSettleResult {
    const reservation = this.memoryReservations.get(input.reservationId);
    if (!reservation || reservation.status !== 'RESERVED') {
      return { settled: false, refundedTokens: 0 };
    }
    const delta = Math.max(0, reservation.reservedTokens - input.actualTokens);
    const used = this.memoryUsed.get(reservation.bucketDate) ?? 0;
    this.memoryUsed.set(reservation.bucketDate, Math.max(0, used - delta));
    reservation.status = 'SETTLED';
    return { settled: true, refundedTokens: delta };
  }
}
