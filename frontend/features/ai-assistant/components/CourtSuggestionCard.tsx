'use client';

import type { AiCourtSuggestion } from '../api/ai-chat-api';
import styles from './court-suggestion-card.module.css';

function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function CourtSuggestionCard({
  suggestion,
  onSelect,
}: {
  suggestion: AiCourtSuggestion;
  onSelect: (deepLink: string) => void;
}) {
  return (
    <article
      className={styles.card}
      aria-label={`Gợi ý ${suggestion.courtName}`}
    >
      <div className={styles.media}>
        <img
          src={suggestion.imageUrl}
          alt={`Ảnh ${suggestion.courtName}`}
          width={96}
          height={72}
          loading="lazy"
        />
      </div>
      <div className={styles.info}>
        <h4 className={styles.name}>{suggestion.courtName}</h4>
        <p className={styles.type}>
          {suggestion.courtType === 'VIP' ? 'Sân VIP' : 'Sân tiêu chuẩn'}
        </p>
        <p className={styles.price}>
          {formatPrice(suggestion.totalAmount, suggestion.currency)}
        </p>
        <button
          type="button"
          className={styles.action}
          onClick={() => onSelect(suggestion.deepLink)}
        >
          Xem & Đặt sân này
        </button>
      </div>
    </article>
  );
}
