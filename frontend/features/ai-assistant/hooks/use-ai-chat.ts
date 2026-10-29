'use client';

import { useCallback, useState } from 'react';
import { postAiChat, type AiChatHistoryItem } from '../api/ai-chat-api';
import type { AiCourtSuggestion } from '../api/ai-chat-api';

export interface AiChatMessage extends AiChatHistoryItem {
  id: string;
  suggestions?: AiCourtSuggestion[];
}

function nextId(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function sanitizeContent(content: string): string {
  return content.replace(/<[^>]*>/g, '').slice(0, 500);
}

export function useAiChat() {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearOnAccountChange = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const sendMessage = useCallback(
    async (rawMessage: string) => {
      const content = sanitizeContent(rawMessage.trim());
      if (content.length === 0 || isSending) {
        return;
      }
      setIsSending(true);
      setError(null);
      const userMessage: AiChatMessage = {
        id: nextId(),
        role: 'user',
        content,
      };
      const history: AiChatHistoryItem[] = [...messages, userMessage]
        .slice(-6)
        .map((item) => ({ role: item.role, content: item.content }));
      setMessages((previous) => [...previous, userMessage]);
      try {
        const response = await postAiChat(content, history.slice(0, -1));
        const assistantMessage: AiChatMessage = {
          id: nextId(),
          role: 'assistant',
          content: sanitizeContent(response.data.replyText),
          suggestions: response.data.suggestions,
        };
        setMessages((previous) => [...previous, assistantMessage]);
      } catch {
        setError('Không gửi được tin nhắn. Vui lòng thử lại.');
      } finally {
        setIsSending(false);
      }
    },
    [isSending, messages],
  );

  return {
    messages,
    isSending,
    error,
    sendMessage,
    clearOnAccountChange,
  };
}
