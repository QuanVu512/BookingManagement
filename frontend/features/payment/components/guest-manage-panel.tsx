'use client';

import { useRef, useState } from 'react';
import { formatVnd } from '../../booking/model/booking-time';
import {
  applyGuestCancelBooking,
  requestGuestCancelQuote,
  type PaidCancelApplied,
  type PaidCancelQuote,
} from '../../booking/api/booking-service';

function newKey(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

/**
 * C08 guest — quản lý đơn vãng lai bằng scoped token (header, không cookie).
 * Báo phí server → consent tường minh → apply → hiển thị hoàn + recovery.
 */
export function GuestManagePanel({
  bookingId,
  token,
}: {
  bookingId: string;
  token: string;
}) {
  const [quote, setQuote] = useState<PaidCancelQuote | null>(null);
  const [applied, setApplied] = useState<PaidCancelApplied | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const keys = useRef({ quote: '', apply: '' });

  async function loadQuote(fresh: boolean): Promise<void> {
    if (fresh || !keys.current.quote) keys.current.quote = newKey();
    setBusy(true);
    setError('');
    setConsent(false);
    try {
      setQuote(
        await requestGuestCancelQuote(bookingId, token, {
          idempotencyKey: keys.current.quote,
        }),
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'Không lấy được báo phí.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function apply(): Promise<void> {
    if (!quote || !consent) return;
    if (!keys.current.apply) keys.current.apply = newKey();
    setBusy(true);
    setError('');
    try {
      setApplied(
        await applyGuestCancelBooking(bookingId, token, {
          quoteId: quote.quoteId,
          accepted: true,
          idempotencyKey: keys.current.apply,
        }),
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'Không áp dụng được hủy.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (applied) {
    return (
      <div role="status">
        <p>
          Đã hủy đơn {applied.bookingCode}. Phí hủy{' '}
          {formatVnd(applied.penaltyAmount)}, hoàn{' '}
          {formatVnd(applied.totalRefund)} qua quầy (thủ công, có đối soát).
        </p>
      </div>
    );
  }

  return (
    <section aria-label="Hủy đơn khách vãng lai">
      {!quote && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void loadQuote(false)}
        >
          {busy ? 'Đang lấy báo phí…' : 'Yêu cầu hủy có hoàn'}
        </button>
      )}
      {quote && (
        <>
          <p>{quote.policyText}</p>
          <ul>
            <li>
              Đã thanh toán: <strong>{formatVnd(quote.paidAmount)}</strong>
            </li>
            <li>
              Phí hủy (10%): <strong>{formatVnd(quote.penaltyAmount)}</strong>
            </li>
            <li>
              Dự kiến hoàn: <strong>{formatVnd(quote.refundAmount)}</strong>
            </li>
          </ul>
          <p>Báo phí hết hạn lúc {quote.expiresAt}.</p>
          <p>
            <label>
              <input
                type="checkbox"
                checked={consent}
                disabled={busy}
                onChange={(event) => setConsent(event.target.checked)}
              />{' '}
              Tôi đã đọc và đồng ý phí hủy cùng số tiền hoàn trên.
            </label>
          </p>
          <p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void loadQuote(true)}
            >
              Lấy báo phí mới
            </button>{' '}
            <button
              type="button"
              disabled={!consent || busy}
              onClick={() => void apply()}
            >
              {busy ? 'Đang hủy…' : 'Đồng ý hủy và nhận hoàn'}
            </button>
          </p>
        </>
      )}
      {error && (
        <p role="alert">
          {error}{' '}
          <button type="button" onClick={() => void loadQuote(true)}>
            Lấy báo phí mới
          </button>
        </p>
      )}
    </section>
  );
}
