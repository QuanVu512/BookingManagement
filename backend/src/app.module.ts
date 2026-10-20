import { Module } from '@nestjs/common';
import { fileURLToPath } from 'node:url';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UserModule } from './modules/users/user.module.js';
import { CourtsModule } from './modules/courts/courts.module.js';
import { BookingsModule } from './modules/bookings/bookings.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { CheckInModule } from './modules/check-in/check-in.module.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { QueueModule } from './infrastructure/queue/queue.module.js';
import { RedisModule } from './infrastructure/redis/redis.module.js';
import { AuthErrorEnvelopeFilter } from './common/filters/auth-error-envelope.filter.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        '.env',
        '../.env',
        'backend/.env',
        fileURLToPath(new URL('../.env', import.meta.url)),
        fileURLToPath(new URL('../../.env', import.meta.url)),
      ],
    }),
    AuthModule,
    UserModule,
    CourtsModule,
    BookingsModule,
    PaymentsModule,
    CheckInModule,
    PrismaModule,
    QueueModule,
    RedisModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AuthErrorEnvelopeFilter,
    },
  ],
})
export class AppModule {}
