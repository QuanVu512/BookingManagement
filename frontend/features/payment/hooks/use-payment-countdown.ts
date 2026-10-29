'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * FE-PAY-05 — Countdown monotonic (MIG-14).
 * Hiển thị dùng elapsed đơn điệu từ server sample: đổi Date.now trên máy
 * không kéo dài countdown. Hết giờ chỉ phát refresh, không tự EXPIRED UI.
 */
export interface CountdownState {
  remainingMs: number;
  expired: boolean;
}

interface CountdownInput {
  expiresAt: string | null;
  serverNow: string | null;
  onExpired?: () => void;
}
interface CountdownSample {
  expiry: string;
  remaining: number;
  at: number;
}
function captureCountdown(
  expiry: string,
  serverNow: string,
  previous: CountdownSample | null,
): CountdownSample {
  const at = performance.now();
  const remaining = Date.parse(expiry) - Date.parse(serverNow);
  return {
    expiry,
    at,
    remaining:
      previous?.expiry === expiry
        ? Math.min(remaining, previous.remaining - (at - previous.at))
        : remaining,
  };
}
function startCountdown(
  sample: CountdownSample,
  update: (value: number) => void,
  onExpired?: () => void,
) {
  const tick = () => {
    const remaining = Math.max(
      sample.remaining - (performance.now() - sample.at),
      0,
    );
    update(remaining);
    if (remaining <= 0 && onExpired) onExpired();
    return remaining;
  };
  if (!Number.isFinite(sample.remaining) || tick() <= 0) return;
  const timer = window.setInterval(() => {
    if (tick() <= 0) window.clearInterval(timer);
  }, 1000);
  return () => window.clearInterval(timer);
}
export function usePaymentCountdown(input: CountdownInput): CountdownState {
  const [remainingMs, setRemainingMs] = useState(0);
  const notified = useRef<string | null>(null);
  const sample = useRef<CountdownSample | null>(null);
  const callback = useRef(input.onExpired);
  callback.current = input.onExpired;
  useEffect(() => {
    if (!input.expiresAt) return;
    const nowStr = input.serverNow || new Date().toISOString();
    const current = captureCountdown(
      input.expiresAt,
      nowStr,
      sample.current,
    );
    sample.current = current;
    return startCountdown(current, setRemainingMs, () => {
      if (notified.current === current.expiry) return;
      notified.current = current.expiry;
      callback.current?.();
    });
  }, [input.expiresAt, input.serverNow]);
  return {
    remainingMs,
    expired: Boolean(input.expiresAt && remainingMs <= 0),
  };
}

export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
