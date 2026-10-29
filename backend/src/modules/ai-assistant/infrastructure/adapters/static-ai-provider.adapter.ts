import { Injectable } from '@nestjs/common';
import { APPROVED_HOTLINE_TEXT } from '../../application/knowledge/approved-policies.js';
import type {
  AiProviderChatInput,
  AiProviderChatOutput,
  AiProviderPort,
} from '../../application/ports/ai-provider.port.js';
import { estimateTextTokens } from '../../application/ai-token-estimator.js';

@Injectable()
export class StaticAiProviderAdapter implements AiProviderPort {
  async chat(input: AiProviderChatInput): Promise<AiProviderChatOutput> {
    const replyText =
      `Đã ghi nhận: "${input.message}". ` + APPROVED_HOTLINE_TEXT;
    return {
      replyText,
      promptTokens:
        estimateTextTokens(input.systemPrompt) +
        estimateTextTokens(input.message),
      completionTokens: estimateTextTokens(replyText),
    };
  }
}
