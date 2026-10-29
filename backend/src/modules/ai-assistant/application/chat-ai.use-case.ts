import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AI_CHAT_MAX_HISTORY_BYTES,
  AI_MAX_COMPLETION_TOKENS,
  AI_MAX_TOOL_ROUNDS,
  AI_PROTOCOL_OVERHEAD_TOKENS,
  AI_QUOTA_EXCEEDED_STATIC,
} from '../ai-assistant.constants.js';
import {
  AiPayloadTooLargeError,
  QuotaExceededError,
} from '../domain/ai-assistant-errors.js';
import type { AiBudgetManagerPort } from './ports/ai-budget-manager.port.js';
import { AI_BUDGET_MANAGER_PORT } from './ports/ai-budget-manager.port.js';
import type { AiProviderPort } from './ports/ai-provider.port.js';
import { AI_PROVIDER_PORT } from './ports/ai-provider.port.js';
import { Inject } from '@nestjs/common';
import { estimateTextTokens } from './ai-token-estimator.js';
import { answerApprovedQuestion } from './knowledge/approved-policies.js';
import { AI_SYSTEM_INSTRUCTIONS } from './prompts/system-instructions.js';
import type { AiChatHistoryItem } from './ports/ai-provider.port.js';
import { parseTimeRequest } from './tools/time-request-parser.js';
import {
  SearchAvailabilityTool,
  type CourtSuggestion,
} from './tools/search-availability.tool.js';
import type { CourtType } from '../../../enums/index.js';

export interface ChatAiInput {
  message: string;
  history: AiChatHistoryItem[];
  quotaLimit: number;
  bucketDate: string;
}

export interface ChatAiResult {
  replyText: string;
  reservationId: string;
  fromKnowledge: boolean;
  suggestions?: CourtSuggestion[];
}

function sanitizeHistory(history: AiChatHistoryItem[]): AiChatHistoryItem[] {
  return history
    .filter((item) => item.role === 'user' || item.role === 'assistant')
    .map((item) => ({ role: item.role, content: item.content.trim() }))
    .filter((item) => item.content.length > 0);
}

function detectCourtType(message: string): CourtType | undefined {
  const normalized = message.toLowerCase();
  if (/\bvip\b/.test(normalized)) {
    return 'VIP';
  }
  if (/(thường|thuong|standard)/.test(normalized)) {
    return 'STANDARD';
  }
  return undefined;
}

@Injectable()
export class ChatAiUseCase {
  constructor(
    @Inject(AI_PROVIDER_PORT) private readonly provider: AiProviderPort,
    @Inject(AI_BUDGET_MANAGER_PORT)
    private readonly budget: AiBudgetManagerPort,
    private readonly searchAvailability: SearchAvailabilityTool,
  ) {}

  async execute(input: ChatAiInput): Promise<ChatAiResult> {
    const message = input.message.trim();
    const history = sanitizeHistory(input.history).slice(-6);
    const historyBytes = history.reduce(
      (total, item) => total + Buffer.byteLength(item.content, 'utf8'),
      0,
    );
    if (historyBytes > AI_CHAT_MAX_HISTORY_BYTES) {
      throw new AiPayloadTooLargeError();
    }
    const knowledgeAnswer = answerApprovedQuestion(message);
    if (knowledgeAnswer) {
      return {
        replyText: knowledgeAnswer,
        reservationId: randomUUID(),
        fromKnowledge: true,
      };
    }
    const timeRequest = parseTimeRequest(message);
    if (timeRequest.kind === 'needs-duration') {
      return {
        replyText:
          `Bạn muốn đặt lúc ${timeRequest.timeLabel} ${timeRequest.dateLabel}, ` +
          `dự kiến chơi trong bao lâu để em kiểm tra sân trống giúp bạn?`,
        reservationId: randomUUID(),
        fromKnowledge: true,
      };
    }
    if (timeRequest.kind === 'window') {
      return this.searchWithRetry(message, timeRequest.window);
    }
    return this.askProvider(input.message, history, input);
  }

  private async searchWithRetry(
    message: string,
    window: { startsAt: string; endsAt: string },
  ): Promise<ChatAiResult> {
    const courtType = detectCourtType(message);
    let rounds = 0;
    while (rounds < AI_MAX_TOOL_ROUNDS) {
      rounds += 1;
      try {
        const result = await this.searchAvailability.execute({
          courtType,
          startsAt: window.startsAt,
          endsAt: window.endsAt,
        });
        return {
          replyText: this.composeCoverageReply(result.coverage),
          reservationId: randomUUID(),
          fromKnowledge: false,
          suggestions: result.suggestions,
        };
      } catch {
        if (rounds >= AI_MAX_TOOL_ROUNDS) {
          return {
            replyText: AI_QUOTA_EXCEEDED_STATIC,
            reservationId: randomUUID(),
            fromKnowledge: false,
          };
        }
      }
    }
    return {
      replyText: AI_QUOTA_EXCEEDED_STATIC,
      reservationId: randomUUID(),
      fromKnowledge: false,
    };
  }

  private composeCoverageReply(coverage: {
    checkedCourtsCount: number;
    failedCourtsCount: number;
    availableCourtsCount: number;
  }): string {
    const checkedTotal =
      coverage.checkedCourtsCount + coverage.failedCourtsCount;
    if (
      coverage.availableCourtsCount === 0 &&
      coverage.failedCourtsCount === 0
    ) {
      return (
        `${checkedTotal} sân em vừa kiểm tra đều đã kín lịch, ` +
        `bạn có thể kiểm tra tiếp hoặc bấm xem lịch tổng.`
      );
    }
    if (coverage.failedCourtsCount > 0) {
      return (
        `Em đã kiểm tra ${checkedTotal} sân, có ` +
        `${coverage.failedCourtsCount} sân gặp sự cố kết nối nên chưa kiểm tra được, ` +
        `không phải sân đã kín. ` +
        (coverage.availableCourtsCount > 0
          ? `Còn ${coverage.availableCourtsCount} sân trống bên dưới, bạn bấm để xem và đặt nhé.`
          : `Bạn thử lại sau giây lát giúp em.`)
      );
    }
    return (
      `Đã kiểm tra ${checkedTotal} sân đầu tiên, ` +
      `có ${coverage.availableCourtsCount} sân còn trống bên dưới, ` +
      `bạn bấm để xem và đặt nhé.`
    );
  }

  private async askProvider(
    message: string,
    history: AiChatHistoryItem[],
    input: ChatAiInput,
  ): Promise<ChatAiResult> {
    const reservationId = randomUUID();
    const reserveTokens =
      estimateTextTokens(message.trim()) +
      estimateTextTokens(AI_SYSTEM_INSTRUCTIONS) +
      history.reduce(
        (total, item) => total + estimateTextTokens(item.content),
        0,
      ) +
      AI_MAX_COMPLETION_TOKENS +
      AI_PROTOCOL_OVERHEAD_TOKENS;
    const reservation = await this.budget.reserve({
      reservationId,
      reserveTokens,
      bucketDate: input.bucketDate,
      quotaLimit: input.quotaLimit,
    });
    if (!reservation.allowed) {
      throw new QuotaExceededError();
    }
    try {
      const output = await this.provider.chat({
        message: message.trim(),
        history,
        systemPrompt: AI_SYSTEM_INSTRUCTIONS,
      });
      const actualTokens = output.promptTokens + output.completionTokens;
      await this.budget.settle({ reservationId, actualTokens });
      return {
        replyText: output.replyText,
        reservationId,
        fromKnowledge: false,
      };
    } catch {
      await this.budget.markConservativeHeld(reservationId);
      return {
        replyText: AI_QUOTA_EXCEEDED_STATIC,
        reservationId,
        fromKnowledge: false,
      };
    }
  }
}
