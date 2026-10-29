import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AI_DAILY_TOKEN_QUOTA_DEFAULT,
  AI_DISABLED_STATIC,
} from '../ai-assistant.constants.js';
import {
  AiDisabledError,
  AiPayloadTooLargeError,
  QuotaExceededError,
} from '../domain/ai-assistant-errors.js';
import { ChatAiUseCase } from '../application/chat-ai.use-case.js';
import { ChatAiRequestDto } from './dto/chat-request.dto.js';

function todayBucket(): string {
  return new Date().toISOString().slice(0, 10);
}

@Controller('api/ai')
export class AiAssistantController {
  constructor(
    private readonly chatAi: ChatAiUseCase,
    private readonly config: ConfigService,
  ) {}

  @Post('chat')
  @HttpCode(200)
  async chat(@Body() input: ChatAiRequestDto) {
    const enabled = this.config.get<string>('AI_ASSISTANT_ENABLED') !== 'false';
    if (!enabled) {
      throw new HttpException(
        { success: false, error: 'AI_DISABLED', message: AI_DISABLED_STATIC },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    try {
      const result = await this.chatAi.execute({
        message: input.message,
        history: input.history ?? [],
        quotaLimit: AI_DAILY_TOKEN_QUOTA_DEFAULT,
        bucketDate: todayBucket(),
      });
      return { success: true, data: result };
    } catch (error: unknown) {
      if (error instanceof QuotaExceededError) {
        throw new HttpException(
          {
            success: false,
            error: 'AI_QUOTA_EXCEEDED',
            message:
              'Hạn mức AI hôm nay đã hết. Vui lòng thử lại vào ngày mai hoặc liên hệ hotline.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (error instanceof AiPayloadTooLargeError) {
        throw new HttpException(
          { success: false, error: 'AI_PAYLOAD_TOO_LARGE' },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (error instanceof AiDisabledError) {
        throw new HttpException(
          { success: false, error: 'AI_DISABLED' },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw error;
    }
  }
}
