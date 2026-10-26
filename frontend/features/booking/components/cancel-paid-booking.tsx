'use client';

import { useRef, useState } from 'react';
import { ArenaDialog } from '../../../components/arena/arena-dialog';
import { formatVnd } from '../model/booking-time';
import type { BookingRecord } from '../model/booking';
import {
  applyCancelBooking,
  requestCancelQuote,
  type PaidCancelApplied,
  type PaidCancelQuote,
} from '../api/booking-service';

type Phase = 'idle' | 'quoting' | 'quoted' | 'applying' | 'done';

function newKey(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

/**
 * C08 — Hủy đơn CONFIRMED có hoàn (member).
 * Báo phí server → consent tường minh (checkbox mặc định KHÔNG chọn) →
 * apply nguyên tử → hiển thị phí/hoàn + recovery khi quote stale/hết hạn.
 */
export function CancelPaidBooking({
  booking,
  disabled,
  onDone,
}: {
  booking: BookingRecord;
  disabled: boolean;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [quote, setQuote] = useState<PaidCancelQuote | null>(null);
  const [applied, setApplied] = useState<PaidCancelApplied | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const keys = useRef({ quote: '', apply: '' });
  if (booking.status !== 'CONFIRMED') return null;

  const fail = (reason: unknown): void => {
    setError(
      reason instanceof Error
        ? reason.message
        : 'Chưa xác nhận được kết quả. Hãy thử lại.',
    );
  };

  async function loadQuote(fresh: boolean): Promise<void> {
    if (fresh || !keys.current.quote) keys.current.quote = newKey();
    setPhase('quoting');
    setError('');
    setConsent(false);
    try {
      const result = await requestCancelQuote(booking.id, {
        idempotencyKey: keys.current.quote,
      });
      setQuote(result);
      setPhase('quoted');
    } catch (reason: unknown) {
      fail(reason);
      setPhase('idle');
    }
  }

  async function apply(): Promise<void> {
    if (!quote || !consent) return;
    if (!keys.current.apply) keys.current.apply = newKey();
    setPhase('applying');
    setError('');
    try {
      const result = await applyCancelBooking(booking.id, {
        quoteId: quote.quoteId,
        accepted: true,
        idempotencyKey: keys.current.apply,
      });
      setApplied(result);
      setPhase('done');
    } catch (reason: unknown) {
      fail(reason);
      setPhase('quoted');
    }
  }

  function close(): void {
    setOpen(false);
    setPhase('idle');
    setQuote(null);
    setApplied(null);
    setConsent(false);
    setError('');
  }

  return (
    <>
      <button
        type="button"
        className="arena-button arena-button-danger"
        disabled={disabled}
        aria-label="Yêu cầu hủy sân — xem báo phí và xác nhận hoàn tiền"
        onClick={() => {
          setOpen(true);
          void loadQuote(false);
        }}
      >
        Yêu cầu hủy sân
      </button>
      {open && (
        <ArenaDialog title="Hủy đơn đã xác nhận" onClose={close}>
          {phase === 'quoting' && <p role="status">Đang lấy báo phí hủy…</p>}
          {(phase === 'quoted' || phase === 'applying') && quote && (
            <>
              <p>{quote.policyText}</p>
              <ul>
                <li>
                  Đã thanh toán:{' '}
                  <strong>{formatVnd(quote.paidAmount)}</strong>
                </li>
                <li>
                  Phí hủy sân:{' '}
                  <strong>{formatVnd(quote.penaltyAmount)}</strong>
                </li>
                <li>
                  Dự kiến hoàn:{' '}
                  <strong>{formatVnd(quote.refundAmount)}</strong>
                </li>
              </ul>
              <p>Báo phí hết hạn lúc {quote.expiresAt}.</p>
              <p>
                <label>
                  <input
                    type="checkbox"
                    checked={consent}
                    disabled={phase === 'applying'}
                    onChange={(event) => setConsent(event.target.checked)}
                  />{' '}
                  Tôi đã đọc và đồng ý phí hủy cùng số tiền hoàn trên.
                </label>
              </p>
              <div className="arena-dialog-actions">
                <button
                  type="button"
                  className="arena-button"
                  disabled={phase === 'applying'}
                  onClick={() => void loadQuote(true)}
                >
                  Lấy báo phí mới
                </button>
                <button
                  type="button"
                  className="arena-button arena-button-danger"
                  disabled={!consent || phase === 'applying'}
                  onClick={() => void apply()}
                >
                  {phase === 'applying'
                    ? 'Đang hủy…'
                    : 'Đồng ý hủy và nhận hoàn'}
                </button>
              </div>
            </>
          )}
          {phase === 'done' && applied && (
            <>
              <p role="status">
                Đã hủy đơn {applied.bookingCode}. Phí hủy{' '}
                {formatVnd(applied.penaltyAmount)}, hoàn{' '}
                {formatVnd(applied.totalRefund)} qua quầy (thủ công, có đối
                soát).
              </p>
              <div className="arena-dialog-actions">
                <button
                  type="button"
                  className="arena-button"
                  onClick={() => {
                    close();
                    onDone();
                  }}
                >
                  Xong
                </button>
              </div>
            </>
          )}
          {error && (
            <p role="alert">
              {error}{' '}
              <button
                type="button"
                className="arena-button"
                onClick={() => void loadQuote(true)}
              >
                Lấy báo phí mới
              </button>
            </p>
          )}
        </ArenaDialog>
      )}
    </>
  );
}
