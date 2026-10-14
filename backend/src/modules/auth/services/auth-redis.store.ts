import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { RedisService } from '../../../infrastructure/redis/redis.service.js';

@Injectable()
export class AuthRedisStore {
  constructor(private readonly redis: RedisService) {}

  get(key: string): Promise<string | null> {
    return this.execute(() => this.redis.client.get(key));
  }

  set(key: string, value: string, ttlSeconds: number): Promise<string | null> {
    return this.execute(() =>
      this.redis.client.set(key, value, { EX: ttlSeconds }),
    );
  }

  consume(key: string): Promise<string | null> {
    return this.execute(() => this.redis.client.getDel(key));
  }

  evaluate(
    script: string,
    key: string,
    argumentsList: string[],
  ): Promise<unknown> {
    return this.execute(() =>
      this.redis.client.eval(script, { keys: [key], arguments: argumentsList }),
    );
  }

  private async execute<Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> {
    try {
      return await operation();
    } catch {
      throw new ServiceUnavailableException(
        'Dịch vụ xác thực tạm thời không khả dụng.',
      );
    }
  }
}
