'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getPaymentRequest } from '../api/payment-service';
import type { PaymentRequestRecord } from '../model/payment';

/**
 * FE-PAY-05 — Polling trạng thái thanh toán (MIG-14).
 * - Poll khi CREATING / PENDING / PARTIALLY_PAID; dừng ở trạng thái cuối.
 * - Single-flight + backoff; stale subject guard (đổi request/account thì
 *   bỏ response cũ); resume khi online/focus.
 */
const POLL_INTERVALS = [2000, 3000, 5000, 8000, 12000];
const TERMINAL: PaymentRequestRecord['status'][] = [
  'PAID',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
];

export interface PaymentPollState {
  request: PaymentRequestRecord | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function usePaymentStatus(requestId: string | null): PaymentPollState {
  const [request, setRequest] = useState<PaymentRequestRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attemptRef = useRef(0);
  const inFlightRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const fetchOnce = useCallback(
    async (id: string, subject: string) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      const controller = new AbortController();
      try {
        const record = await getPaymentRequest(id, controller.signal);
        // Stale subject guard: subject đổi giữa chừng thì bỏ kết quả.
        if (subject !== requestId) return;
        setRequest(record);
        setError(null);
        attemptRef.current = 0;
      } catch (fetchError) {
        if (subject !== requestId) return;
        attemptRef.current += 1;
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : 'Không tải được trạng thái thanh toán.',
        );
      } finally {
        inFlightRef.current = false;
      }
    },
    [requestId],
  );

  const schedule = useCallback(
    (id: string, subject: string) => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      const status = request?.status;
      if (status && TERMINAL.includes(status)) return;
      const delay =
        POLL_INTERVALS[Math.min(attemptRef.current, POLL_INTERVALS.length - 1)];
      timerRef.current = window.setTimeout(() => {
        void fetchOnce(id, subject).then(() => schedule(id, subject));
      }, delay);
    },
    [fetchOnce, request?.status],
  );

  const refresh = useCallback(() => {
    if (!requestId) return;
    attemptRef.current = 0;
    void fetchOnce(requestId, requestId);
  }, [fetchOnce, requestId]);

  useEffect(() => {
    setRequest(null);
    setError(null);
    attemptRef.current = 0;
    if (!requestId) return;
    setLoading(true);
    void fetchOnce(requestId, requestId).finally(() => setLoading(false));
    schedule(requestId, requestId);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const onOnline = () => refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onOnline);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onOnline);
    };
  }, [requestId, fetchOnce, schedule, refresh]);

  return { request, loading, error, refresh };
}
