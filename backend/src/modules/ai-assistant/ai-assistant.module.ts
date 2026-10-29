import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module.js';
import { CourtsModule } from '../courts/courts.module.js';
import { ChatAiUseCase } from './application/chat-ai.use-case.js';
import { AI_BUDGET_MANAGER_PORT } from './application/ports/ai-budget-manager.port.js';
import { AI_PROVIDER_PORT } from './application/ports/ai-provider.port.js';
import { SearchAvailabilityTool } from './application/tools/search-availability.tool.js';
import { RedisAiBudgetAdapter } from './infrastructure/adapters/redis-ai-budget.adapter.js';
import { StaticAiProviderAdapter } from './infrastructure/adapters/static-ai-provider.adapter.js';
import { AiAssistantController } from './presentation/ai-assistant.controller.js';

@Module({
  imports: [BookingsModule, CourtsModule],
  controllers: [AiAssistantController],
  providers: [
    ChatAiUseCase,
    SearchAvailabilityTool,
    StaticAiProviderAdapter,
    RedisAiBudgetAdapter,
    {
      provide: AI_PROVIDER_PORT,
      useExisting: StaticAiProviderAdapter,
    },
    {
      provide: AI_BUDGET_MANAGER_PORT,
      useExisting: RedisAiBudgetAdapter,
    },
  ],
  exports: [ChatAiUseCase],
})
export class AiAssistantModule {}
