import { ChatAiUseCase } from './chat-ai.use-case.js';
import type { AiBudgetManagerPort } from './ports/ai-budget-manager.port.js';
import type {
  AiProviderChatInput,
  AiProviderPort,
} from './ports/ai-provider.port.js';

class FakeBudget implements AiBudgetManagerPort {
  allowed = true;
  reserveTokens = 0;
  settleCalls = 0;
  heldCalls: string[] = [];
  settledIds = new Set<string>();
  used = 0;
  constructor(private readonly quotaLimit: number) {}

  async reserve(input: {
    reservationId: string;
    reserveTokens: number;
    bucketDate: string;
    quotaLimit: number;
  }) {
    this.reserveTokens = input.reserveTokens;
    if (this.used + input.reserveTokens > input.quotaLimit) {
      return { allowed: false };
    }
    this.used += input.reserveTokens;
    return { allowed: this.allowed && true };
  }

  async settle(input: { reservationId: string; actualTokens: number }) {
    this.settleCalls += 1;
    if (this.settledIds.has(input.reservationId)) {
      return { settled: false, refundedTokens: 0 };
    }
    this.settledIds.add(input.reservationId);
    return { settled: true, refundedTokens: 10 };
  }

  async markConservativeHeld(reservationId: string): Promise<void> {
    this.heldCalls.push(reservationId);
  }
}

class FakeProvider implements AiProviderPort {
  calls = 0;
  shouldThrow = false;
  async chat(input: AiProviderChatInput) {
    this.calls += 1;
    if (this.shouldThrow) {
      throw new Error('provider timeout');
    }
    const replyText = `Echo: ${input.message}`;
    return { replyText, promptTokens: 100, completionTokens: 20 };
  }
}

function buildUseCase(
  quotaLimit: number,
  searchResult?: {
    suggestions: Array<{
      courtId: string;
      courtName: string;
      courtType: 'STANDARD' | 'VIP';
      totalAmount: number;
      currency: string;
      available: boolean;
      deepLink: string;
      imageUrl: string;
    }>;
    coverage: {
      totalActiveCourts: number;
      checkedCourtsCount: number;
      failedCourtsCount: number;
      availableCourtsCount: number;
    };
  },
) {
  const budget = new FakeBudget(quotaLimit);
  const provider = new FakeProvider();
  const searchAvailability = {
    execute: async () =>
      searchResult ?? {
        suggestions: [],
        coverage: {
          totalActiveCourts: 0,
          checkedCourtsCount: 0,
          failedCourtsCount: 0,
          availableCourtsCount: 0,
        },
      },
  };
  return {
    useCase: new ChatAiUseCase(provider, budget, searchAvailability),
    budget,
    provider,
  };
}

describe('Stage 1 AI chat', () => {
  test('tính phí hủy chính xác từ tri thức duyệt', async () => {
    const { useCase } = buildUseCase(50_000);
    const result = await useCase.execute({
      message: 'Sân 1 triệu tôi cọc 300k, hủy trước 15 tiếng mất bao nhiêu?',
      history: [],
      quotaLimit: 50_000,
      bucketDate: '2026-10-28',
    });
    expect(result.fromKnowledge).toBe(true);
    expect(result.replyText).toMatch('100.000');
    expect(result.replyText).toMatch('200.000');
  });

  test('quota không đủ thì chặn trước khi gọi provider', async () => {
    const { useCase, provider } = buildUseCase(10);
    await expect(
      useCase.execute({
        message: 'tôi muốn đặt sân tối nay, tư vấn giúp tôi chọn sân nào',
        history: [],
        quotaLimit: 10,
        bucketDate: '2026-10-28',
      }),
    ).rejects.toThrow('AI_QUOTA_EXCEEDED');
    expect(provider.calls).toBe(0);
  });

  test('settle idempotent: gọi lại cùng reservation chỉ hoàn một lần', async () => {
    const budget = new FakeBudget(50_000);
    const first = await budget.settle({
      reservationId: 'res-1',
      actualTokens: 120,
    });
    const second = await budget.settle({
      reservationId: 'res-1',
      actualTokens: 120,
    });
    expect(first.settled).toBe(true);
    expect(second.settled).toBe(false);
    expect(second.refundedTokens).toBe(0);
  });

  test('provider timeout giữ nguyên reserve bảo thủ', async () => {
    const { useCase, budget, provider } = buildUseCase(50_000);
    provider.shouldThrow = true;
    const result = await useCase.execute({
      message: 'tư vấn giúp tôi chọn sân tối nay',
      history: [],
      quotaLimit: 50_000,
      bucketDate: '2026-10-28',
    });
    expect(budget.heldCalls).toHaveLength(1);
    expect(result.reservationId).toBe(budget.heldCalls[0]);
  });

  test('history vượt 4000 bytes bị chặn', async () => {
    const { useCase } = buildUseCase(50_000);
    await expect(
      useCase.execute({
        message: 'chào bạn',
        history: [{ role: 'user', content: 'x'.repeat(5000) }],
        quotaLimit: 50_000,
        bucketDate: '2026-10-28',
      }),
    ).rejects.toThrow('AI_PAYLOAD_TOO_LARGE');
  });
});

describe('Stage 2 AI smart navigator', () => {
  const suggestion = {
    courtId: 'court-1',
    courtName: 'Sân 1',
    courtType: 'STANDARD' as const,
    totalAmount: 100_000,
    currency: 'VND',
    available: true,
    deepLink: '/courts/court-1?startsAt=a&endsAt=b',
    imageUrl: '/courts/court-3.jpg',
  };

  test('19h tối mai thiếu thời lượng thì hỏi lại, không gọi provider', async () => {
    const { useCase, provider } = buildUseCase(50_000);
    const result = await useCase.execute({
      message: '19h tối mai còn sân không?',
      history: [],
      quotaLimit: 50_000,
      bucketDate: '2026-10-28',
    });
    expect(result.replyText).toMatch('bao lâu');
    expect(provider.calls).toBe(0);
  });

  test('window đầy đủ thì tra cứu và trả suggestions kèm deep-link', async () => {
    const { useCase, provider } = buildUseCase(50_000, {
      suggestions: [suggestion],
      coverage: {
        totalActiveCourts: 10,
        checkedCourtsCount: 5,
        failedCourtsCount: 0,
        availableCourtsCount: 1,
      },
    });
    const result = await useCase.execute({
      message: 'đặt sân 19h tối mai, chơi 2 tiếng',
      history: [],
      quotaLimit: 50_000,
      bucketDate: '2026-10-28',
    });
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions?.[0].deepLink).toMatch(
      /^\/courts\/court-1\?startsAt=.*&endsAt=.*$/,
    );
    expect(result.replyText).toMatch('Đã kiểm tra 5 sân');
    expect(provider.calls).toBe(0);
  });

  test('5 sân đều bận thì báo kín đúng phạm vi đã kiểm tra', async () => {
    const { useCase } = buildUseCase(50_000, {
      suggestions: [],
      coverage: {
        totalActiveCourts: 10,
        checkedCourtsCount: 5,
        failedCourtsCount: 0,
        availableCourtsCount: 0,
      },
    });
    const result = await useCase.execute({
      message: 'đặt sân 19h tối mai, chơi 2 tiếng',
      history: [],
      quotaLimit: 50_000,
      bucketDate: '2026-10-28',
    });
    expect(result.replyText).toMatch('đều đã kín lịch');
    expect(result.replyText).not.toMatch('toàn hệ thống');
    expect(result.suggestions).toHaveLength(0);
  });

  test('sân lỗi kết nối được báo riêng, không tính là bận', async () => {
    const { useCase } = buildUseCase(50_000, {
      suggestions: [],
      coverage: {
        totalActiveCourts: 10,
        checkedCourtsCount: 4,
        failedCourtsCount: 1,
        availableCourtsCount: 0,
      },
    });
    const result = await useCase.execute({
      message: 'đặt sân 19h tối mai, chơi 2 tiếng',
      history: [],
      quotaLimit: 50_000,
      bucketDate: '2026-10-28',
    });
    expect(result.replyText).toMatch('sự cố kết nối');
  });
});
