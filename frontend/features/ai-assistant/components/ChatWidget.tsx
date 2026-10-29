'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAiChat } from '../hooks/use-ai-chat';
import { CourtSuggestionCard } from './CourtSuggestionCard';
import styles from './chat-widget.module.css';

function MessageIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      <circle cx="8.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function BotIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}

export function ChatWidget() {
  const enabled = process.env.NEXT_PUBLIC_AI_ASSISTANT_ENABLED !== 'false';
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { messages, isSending, error, sendMessage } = useAiChat();
  const [draft, setDraft] = useState('');
  const fabRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleSelectSuggestion = (deepLink: string) => {
    setIsOpen(false);
    router.push(deepLink);
  };

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        fabRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  if (!enabled || !isMounted) {
    return null;
  }

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        className={styles.fab}
        aria-label={isOpen ? 'Đóng trợ lý AI' : 'Mở trợ lý AI'}
        title={isOpen ? 'Đóng trợ lý AI' : 'Hỏi AI'}
        aria-expanded={isOpen}
        aria-controls="ai-chat-window"
        onClick={() => setIsOpen((previous) => !previous)}
        data-testid="ai-chat-fab"
      >
        <span className={styles.visuallyHidden}>
          {isOpen ? 'Đóng' : 'Hỏi AI'}
        </span>
        {isOpen ? (
          <CloseIcon className={styles.fabIcon} />
        ) : (
          <MessageIcon className={styles.fabIcon} />
        )}
      </button>
      {isOpen ? (
        <section
          id="ai-chat-window"
          role="dialog"
          aria-label="Trợ lý đặt sân"
          className={styles.window}
          data-testid="ai-chat-widget"
        >
          <div className={styles.header}>
            <div className={styles.headerTitle}>
              <BotIcon className={styles.headerBotIcon} />
              <span>Trợ lý đặt sân</span>
            </div>
            <button
              type="button"
              className={styles.closeButton}
              aria-label="Đóng khung chat"
              onClick={() => {
                setIsOpen(false);
                fabRef.current?.focus();
              }}
            >
              ✕
            </button>
          </div>
          <div role="log" aria-live="polite" className={styles.log}>
            {messages.length === 0 ? (
              <p className={styles.emptyHint}>
                Hỏi tôi về phí hủy, tiền cọc, hoặc giờ mở cửa.
              </p>
            ) : null}
            {messages.map((message) => (
              <div key={message.id}>
                <p
                  data-role={message.role}
                  className={
                    message.role === 'user'
                      ? styles.messageUser
                      : styles.messageAssistant
                  }
                >
                  {message.content}
                </p>
                {message.suggestions?.map((suggestion) => (
                  <CourtSuggestionCard
                    key={suggestion.courtId}
                    suggestion={suggestion}
                    onSelect={handleSelectSuggestion}
                  />
                ))}
              </div>
            ))}
          </div>
          {error ? (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          ) : null}
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(draft);
              setDraft('');
            }}
          >
            <label htmlFor="ai-chat-input" className={styles.visuallyHidden}>
              Nhập câu hỏi
            </label>
            <input
              ref={inputRef}
              id="ai-chat-input"
              className={styles.input}
              value={draft}
              maxLength={500}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ví dụ: hủy sân mất bao nhiêu phí?"
              autoComplete="off"
            />
            <button
              type="submit"
              className={styles.sendButton}
              disabled={isSending}
            >
              {isSending ? 'Đang gửi...' : 'Gửi'}
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
}
