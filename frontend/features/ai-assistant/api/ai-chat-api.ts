export interface AiChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiCourtSuggestion {
  courtId: string;
  courtName: string;
  courtType: 'STANDARD' | 'VIP';
  totalAmount: number;
  currency: string;
  available: boolean;
  deepLink: string;
  imageUrl: string;
}

export interface AiChatResponse {
  success: boolean;
  data: {
    replyText: string;
    reservationId: string;
    fromKnowledge: boolean;
    suggestions?: AiCourtSuggestion[];
  };
}

function resolveApiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (base && base.length > 0) {
    return base.replace(/\/$/, '');
  }
  return '';
}

export async function postAiChat(
  message: string,
  history: AiChatHistoryItem[],
): Promise<AiChatResponse> {
  const response = await fetch(`${resolveApiBase()}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ message, history }),
  });
  if (!response.ok) {
    throw new Error(`AI_CHAT_FAILED_${response.status}`);
  }
  return (await response.json()) as AiChatResponse;
}
