import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { MintCheckinTokenUseCase } from './application/mint-checkin-token.use-case.js';
import { VerifyCheckinUseCase } from './application/verify-checkin.use-case.js';
import { ManualCheckinUseCase } from './application/manual-checkin.use-case.js';
import { CompleteBookingUseCase } from './application/complete-booking.use-case.js';
import { CheckinController } from './presentation/checkin.controller.js';
import { GuestCheckinController } from './presentation/guest-checkin.controller.js';
import { StaffCheckinsController } from './presentation/staff-checkins.controller.js';

/**
 * C10/C11 — Check-in và hoàn tất.
 * Phụ thuộc một chiều: Auth (guards) + Payments (GuestTokenGuard,
 * money thuần, tx options). Không module nào phụ thuộc ngược lại.
 */
@Module({
  imports: [AuthModule, PaymentsModule],
  controllers: [
    CheckinController,
    GuestCheckinController,
    StaffCheckinsController,
  ],
  providers: [
    MintCheckinTokenUseCase,
    VerifyCheckinUseCase,
    ManualCheckinUseCase,
    CompleteBookingUseCase,
  ],
})
export class CheckInModule {}
