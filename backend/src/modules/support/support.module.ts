import { Module } from '@nestjs/common';
import { SupportController } from './presentation/support.controller.js';
import {
  SubmitComplaintUseCase,
  GetOwnComplaintUseCase,
} from './application/submit-complaint.use-case.js';
import { InMemorySupportCaseStore } from './infrastructure/in-memory-support-case-store.js';
import { SUPPORT_CASE_STORE } from './ports/support-case-store.js';

@Module({
  controllers: [SupportController],
  providers: [
    InMemorySupportCaseStore,
    {
      provide: SUPPORT_CASE_STORE,
      useExisting: InMemorySupportCaseStore,
    },
    SubmitComplaintUseCase,
    GetOwnComplaintUseCase,
  ],
  exports: [SUPPORT_CASE_STORE, SubmitComplaintUseCase, GetOwnComplaintUseCase],
})
export class SupportModule {}
