export type AiChatRole = 'user' | 'assistant';

export interface AiChatHistoryItem {
  role: AiChatRole;
  content: string;
}

export interface AiProviderChatInput {
  message: string;
  history: AiChatHistoryItem[];
  systemPrompt: string;
}

export interface AiProviderChatOutput {
  replyText: string;
  promptTokens: number;
  completionTokens: number;
}

export interface AiProviderPort {
  chat(input: AiProviderChatInput): Promise<AiProviderChatOutput>;
}

export const AI_PROVIDER_PORT = 'AI_PROVIDER_PORT';
