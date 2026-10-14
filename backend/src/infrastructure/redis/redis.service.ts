import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  readonly client: ReturnType<typeof createClient>;

  constructor(configService: ConfigService) {
    this.client = createClient({
      url: configService.getOrThrow<string>('REDIS_URL'),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.close();
    }
  }
}
