import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import {
  REDIS_CONNECT_TIMEOUT_MS,
  REDIS_SOCKET_TIMEOUT_MS,
  REDIS_PING_INTERVAL_MS,
  REDIS_MAX_QUEUED_COMMANDS,
  REDIS_RECONNECT_DELAY_MS,
  REDIS_RECONNECT_ATTEMPTS,
} from './redis.constants.js';

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  readonly client: ReturnType<typeof createClient>;

  constructor(configService: ConfigService) {
    this.client = createClient({
      url: configService.getOrThrow<string>('REDIS_URL'),
      disableOfflineQueue: true,
      pingInterval: REDIS_PING_INTERVAL_MS,
      commandsQueueMaxLength: REDIS_MAX_QUEUED_COMMANDS,
      socket: {
        connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
        socketTimeout: REDIS_SOCKET_TIMEOUT_MS,
        reconnectStrategy: (retries) =>
          retries < REDIS_RECONNECT_ATTEMPTS ? REDIS_RECONNECT_DELAY_MS : false,
      },
    });
    this.client.on('error', () =>
      this.logger.error('Redis connection unavailable.'),
    );
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.isOpen) {
      this.client.destroy();
    }
  }
}
