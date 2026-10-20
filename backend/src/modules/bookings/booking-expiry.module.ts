import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueModule } from '../../infrastructure/queue/queue.module.js';
import { ExpireEligibleHoldsUseCase } from './application/expire-eligible-holds.use-case.js';
import { BOOKING_EXPIRY_QUEUE } from './booking.constants.js';
import { BookingExpiryProcessor } from './infrastructure/booking-expiry.processor.js';
import { BookingExpiryScheduler } from './infrastructure/booking-expiry.scheduler.js';
import { BookingsModule } from './bookings.module.js';

/**
 * Infrastructure side of booking expiry. Kept out of BookingsModule so the
 * HTTP/domain module and its tests stay independent from Redis/BullMQ.
 */
@Module({
  imports: [
    BookingsModule,
    QueueModule,
    BullModule.registerQueue({ name: BOOKING_EXPIRY_QUEUE }),
  ],
  providers: [
    ExpireEligibleHoldsUseCase,
    BookingExpiryProcessor,
    BookingExpiryScheduler,
  ],
})
export class BookingExpiryModule {}
