import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  BOOKING_EXPIRY_JOB,
  BOOKING_EXPIRY_QUEUE,
  BOOKING_EXPIRY_SCHEDULER_ID,
} from '../booking.constants.js';
import { bookingExpiryIntervalMs } from './booking-expiry.config.js';

@Injectable()
export class BookingExpiryScheduler implements OnModuleInit {
  private readonly logger = new Logger(BookingExpiryScheduler.name);

  constructor(
    @InjectQueue(BOOKING_EXPIRY_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const every = bookingExpiryIntervalMs(this.config);
    // The fixed scheduler id makes every app instance update the same
    // recurring job; it is intentionally left in Redis on shutdown so a
    // rolling restart does not remove the schedule for the remaining instances.
    await this.queue.upsertJobScheduler(
      BOOKING_EXPIRY_SCHEDULER_ID,
      { every },
      {
        name: BOOKING_EXPIRY_JOB,
        data: {},
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
      },
    );
    this.logger.log(`Booking expiry sweep scheduled every ${every}ms.`);
  }
}
