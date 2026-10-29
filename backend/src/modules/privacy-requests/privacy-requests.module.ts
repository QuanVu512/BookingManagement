import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrivacyRequestsController } from './presentation/privacy-requests.controller.js';
import { GuestPrivacyRequestsController } from './presentation/guest-privacy-requests.controller.js';
import { SubmitPrivacyRequestUseCase } from './application/submit-privacy-request.use-case.js';
import {
  GetOwnPrivacyRequestUseCase,
  ListOwnPrivacyRequestsUseCase,
} from './application/get-own-request.use-case.js';
import { InMemoryPrivacyRequestStore } from './infrastructure/in-memory-privacy-request-store.js';
import { PRIVACY_REQUEST_STORE } from './ports/privacy-request-store.js';
import { PaymentsModule } from '../payments/payments.module.js';

@Module({
  imports: [AuthModule, PaymentsModule],
  controllers: [PrivacyRequestsController, GuestPrivacyRequestsController],
  providers: [
    InMemoryPrivacyRequestStore,
    {
      provide: PRIVACY_REQUEST_STORE,
      useExisting: InMemoryPrivacyRequestStore,
    },
    SubmitPrivacyRequestUseCase,
    ListOwnPrivacyRequestsUseCase,
    GetOwnPrivacyRequestUseCase,
  ],
  exports: [
    PRIVACY_REQUEST_STORE,
    SubmitPrivacyRequestUseCase,
    ListOwnPrivacyRequestsUseCase,
    GetOwnPrivacyRequestUseCase,
  ],
})
export class PrivacyRequestsModule {}
