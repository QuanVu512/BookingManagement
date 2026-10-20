import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CourtsModule } from '../courts/courts.module.js';
import { CancelHoldUseCase } from './application/cancel-hold.use-case.js';
import { CreateHoldUseCase } from './application/create-hold.use-case.js';
import { ListMyBookingsUseCase } from './application/list-my-bookings.use-case.js';
import { QuoteAvailabilityUseCase } from './application/quote-availability.use-case.js';
import { PrismaBookingStore } from './infrastructure/prisma-booking-store.js';
import { BookingStore } from './ports/booking-store.js';
import { BookingAvailabilityController } from './presentation/booking-availability.controller.js';
import { BookingsController } from './presentation/bookings.controller.js';

@Module({
  imports: [AuthModule, CourtsModule],
  controllers: [BookingsController, BookingAvailabilityController],
  providers: [
    CreateHoldUseCase,
    QuoteAvailabilityUseCase,
    ListMyBookingsUseCase,
    CancelHoldUseCase,
    { provide: BookingStore, useClass: PrismaBookingStore },
  ],
  exports: [BookingStore],
})
export class BookingsModule {}
