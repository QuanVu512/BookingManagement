'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createPaymentRequest,
  getPaymentOutcome,
  getPaymentRequest,
} from '../api/payment-service';
import { isPaymentSuccess } from '../api/payment-contract';
import type { PaymentRequestRecord, PaymentOutcome } from '../model/payment';

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

interface CheckoutState {
  request: PaymentRequestRecord | null;
  outcome: PaymentOutcome | null;
  loading: boolean;
  error: string;
}
const CHECKOUT_POLL_MS = 3000;

async function readCheckout(
  requestId: string,
  signal: AbortSignal,
  update: (state: Partial<CheckoutState>) => void,
) {
  const [request, outcome] = await Promise.all([
    getPaymentRequest(requestId, signal),
    getPaymentOutcome(requestId, signal),
  ]);
  if (!signal.aborted) update({ request, outcome, error: '' });
  return outcome.screen !== 'SCR_PENDING';
}

type CheckoutUpdate = (state: Partial<CheckoutState>) => void;
function checkoutPoller(controller: AbortController, update: CheckoutUpdate) {
  let timer: ReturnType<typeof setTimeout>;
  const poll = async (requestId: string) => {
    try {
      if (await readCheckout(requestId, controller.signal, update)) return;
    } catch {
      if (!controller.signal.aborted)
        update({ error: 'Chưa cập nhật được thanh toán. Vui lòng thử lại.' });
    }
    if (!controller.signal.aborted)
      timer = setTimeout(() => {
        void poll(requestId);
      }, CHECKOUT_POLL_MS);
  };
  return { poll, stop: () => clearTimeout(timer) };
}
async function createCheckout(
  bookingId: string,
  controller: AbortController,
  update: CheckoutUpdate,
  poll: (id: string) => Promise<void>,
) {
  try {
    const request = await createPaymentRequest({
      bookingId,
      purpose: 'PREPAYMENT',
      prepaymentPercent: 30,
      method: 'PAYOS_TRANSFER',
      idempotencyKey: `booking-checkout:${bookingId}`,
      signal: controller.signal,
    });
    if (!controller.signal.aborted) {
      update({ request, loading: false });
      void poll(request.id);
    }
  } catch {
    if (!controller.signal.aborted)
      update({
        loading: false,
        error: 'Chưa lấy được mã thanh toán. Vui lòng thử lại.',
      });
  }
}
function startCheckout(
  bookingId: string,
  controller: AbortController,
  update: CheckoutUpdate,
) {
  const { poll, stop } = checkoutPoller(controller, update);
  void createCheckout(bookingId, controller, update, poll);
  return () => {
    controller.abort();
    stop();
  };
}

export function checkoutPresentation(checkout: CheckoutState) {
  const success =
    checkout.outcome !== null && isPaymentSuccess(checkout.outcome);
  const terminal =
    checkout.outcome?.screen === 'SCR05_EXPIRED' ||
    checkout.outcome?.screen === 'SCR_CANCELLED';
  return {
    success,
    terminal,
    canPay:
      !success &&
      !terminal &&
      !checkout.outcome?.reviewRequired &&
      checkout.request?.status !== 'PAID',
    title: success
      ? 'Đặt sân thành công'
      : terminal
        ? 'Đơn đã kết thúc'
        : checkout.outcome?.reviewRequired
          ? 'Đang kiểm tra thanh toán'
          : 'Thanh toán đặt cọc 30%',
  };
}

export function useBookingCheckout(bookingId: string) {
  const [state, setState] = useState<CheckoutState>({
    request: null,
    outcome: null,
    loading: true,
    error: '',
  });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ request: null, outcome: null, loading: true, error: '' });
    return startCheckout(bookingId, controller, (patch) =>
      setState((previous) => ({ ...previous, ...patch })),
    );
  }, [bookingId, revision]);
  return {
    ...state,
    ...checkoutPresentation(state),
    refresh: () => setRevision((previous) => previous + 1),
  };
}
