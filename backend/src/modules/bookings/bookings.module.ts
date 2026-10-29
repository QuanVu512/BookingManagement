import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CourtsModule } from '../courts/courts.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { CancelHoldUseCase } from './application/cancel-hold.use-case.js';
import { CreateHoldUseCase } from './application/create-hold.use-case.js';
import { GetMyBookingUseCase } from './application/get-my-booking.use-case.js';
import { ListMyBookingsUseCase } from './application/list-my-bookings.use-case.js';
import { QuoteAvailabilityUseCase } from './application/quote-availability.use-case.js';
import { GetCourtDayOccupanciesUseCase } from './application/get-court-day-occupancies.use-case.js';
import { RequestPaidCancellationUseCase } from './application/request-paid-cancellation.use-case.js';
import { ApplyPaidCancellationUseCase } from './application/apply-paid-cancellation.use-case.js';
import { StaffLateCancelUseCase } from './application/staff-late-cancel.use-case.js';
import { MarkNoShowUseCase } from './application/mark-no-show.use-case.js';
import { SettleEligibleBookingsUseCase } from './application/settle-eligible-bookings.use-case.js';
import { PrismaBookingStore } from './infrastructure/prisma-booking-store.js';
import { RedisBookingSlotLock } from './infrastructure/redis-booking-slot-lock.js';
import { BookingStore } from './ports/booking-store.js';
import { BookingSlotLock } from './ports/booking-slot-lock.js';
import { BookingAvailabilityController } from './presentation/booking-availability.controller.js';
import { BookingsController } from './presentation/bookings.controller.js';
import { GuestCancellationController } from './presentation/guest-cancellation.controller.js';
import { StaffBookingsController } from './presentation/staff-bookings.controller.js';

@Module({
  imports: [AuthModule, CourtsModule, PaymentsModule],
  controllers: [
    BookingsController,
    BookingAvailabilityController,
    GuestCancellationController,
    StaffBookingsController,
  ],
  providers: [
    CreateHoldUseCase,
    GetMyBookingUseCase,
    QuoteAvailabilityUseCase,
    GetCourtDayOccupanciesUseCase,
    ListMyBookingsUseCase,
    CancelHoldUseCase,
    RequestPaidCancellationUseCase,
    ApplyPaidCancellationUseCase,
    StaffLateCancelUseCase,
    MarkNoShowUseCase,
    SettleEligibleBookingsUseCase,
    { provide: BookingStore, useClass: PrismaBookingStore },
    { provide: BookingSlotLock, useClass: RedisBookingSlotLock },
  ],
  exports: [
    BookingStore,
    SettleEligibleBookingsUseCase,
    MarkNoShowUseCase,
    QuoteAvailabilityUseCase,
  ],
})
export class BookingsModule {}
