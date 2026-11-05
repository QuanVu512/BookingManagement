'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { simulateDemoPayment } from '../api/payment-service';

/**
 * FE-PAY-DEMO — Hook nút mô phỏng showcase (F04 review).
 * - Gọi simulator server rồi báo caller poll outcome; không tự kết luận
 *   thành công, không redirect QR check-in từ response mô phỏng.
 * - Chống double-submit ở UI; idempotency thật do server bảo đảm.
 */
export function useDemoSimulate(input: {
  requestId: string | null;
  orderCode?: string | null;
  bookingId: string;
  onSimulated: (result?: unknown) => void;
  enabled?: boolean;
}) {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');
  const inFlightRef = useRef(false);
  const activeController = useRef<AbortController | null>(null);

  useEffect(() => {
    setPhase('idle');
    setError('');
    inFlightRef.current = false;
    return () => activeController.current?.abort();
  }, [input.requestId]);

  const simulate = useCallback(async () => {
    if (input.enabled === false || !input.requestId || inFlightRef.current)
      return;
    inFlightRef.current = true;
    setPhase('loading');
    setError('');
    const controller = new AbortController();
    activeController.current = controller;
    try {
      let guestToken: string | undefined;
      try {
        guestToken =
          sessionStorage.getItem(`guest-manage-token:${input.bookingId}`) ||
          undefined;
        if (!guestToken && typeof window !== 'undefined') {
          const pendingRaw = localStorage.getItem('pending_booking');
          if (pendingRaw) {
            const pending = JSON.parse(pendingRaw);
            if (pending.bookingId === input.bookingId && pending.accessToken) {
              guestToken = pending.accessToken;
              sessionStorage.setItem(
                `guest-manage-token:${input.bookingId}`,
                pending.accessToken,
              );
            }
          }
        }
      } catch {
        guestToken = undefined;
      }
      const result = await simulateDemoPayment({
        requestId: input.requestId,
        orderCode: input.orderCode,
        signal: controller.signal,
        guestToken,
        bookingId: input.bookingId,
      });
      if (!controller.signal.aborted) {
        input.onSimulated(result);
        setPhase('idle');
      }
    } catch (simulateError) {
      if (!controller.signal.aborted) {
        setPhase('error');
        setError(
          simulateError instanceof Error
            ? simulateError.message
            : 'Không mô phỏng được thanh toán. Vui lòng thử lại.',
        );
      }
    } finally {
      if (activeController.current === controller) inFlightRef.current = false;
    }
  }, [input]);

  return { phase, error, simulate, canSimulate: phase !== 'loading' };
}
