import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { ExpireEligibleHoldsUseCase } from '../application/expire-eligible-holds.use-case.js';
import { BOOKING_EXPIRY_QUEUE } from '../booking.constants.js';
import { bookingExpiryBatchSize } from './booking-expiry.config.js';

export interface BookingExpiryJobResult {
  transitioned: number;
}

@Injectable()
@Processor(BOOKING_EXPIRY_QUEUE, { concurrency: 1 })
export class BookingExpiryProcessor
  extends WorkerHost
  implements OnModuleDestroy
{
  private readonly logger = new Logger(BookingExpiryProcessor.name);

  constructor(
    private readonly expireHolds: ExpireEligibleHoldsUseCase,
    private readonly config: ConfigService,
    @InjectQueue(BOOKING_EXPIRY_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async process(_job: Job): Promise<BookingExpiryJobResult> {
    const transitioned = await this.expireHolds.execute(
      bookingExpiryBatchSize(this.config),
    );
    if (transitioned > 0)
      this.logger.log(`Expired ${transitioned} booking hold(s).`);
    return { transitioned };
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(
      `Booking expiry job ${job?.id ?? 'unknown'} failed on attempt ${job?.attemptsMade ?? 0}: ${error.message}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    // BullExplorer also closes its workers on shutdown; close() is idempotent.
    // Closing here keeps Jest from retaining Redis handles when only a test
    // module (not the whole app) is torn down.
    await this.worker.close();
    await this.queue.close();
  }
}
