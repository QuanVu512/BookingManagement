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

export function usePaymentCountdown(input: {
  expiresAt: string | null;
  serverNow: string | null;
  onExpired: () => void;
}): CountdownState {
  const [now, setNow] = useState(() => Date.now());
  const expiredRef = useRef(false);
  const { expiresAt, serverNow, onExpired } = input;
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  useEffect(() => {
    if (!expiresAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  if (!expiresAt || !serverNow) return { remainingMs: 0, expired: false };

  // Offset giữa server và client đo một lần từ sample.
  const offset = Date.parse(serverNow) - now;
  const remainingMs = Date.parse(expiresAt) - (Date.now() + offset);
  const expired = remainingMs <= 0;
  if (expired && !expiredRef.current) {
    expiredRef.current = true;
    // Authoritative refresh — không tự đổi trạng thái thanh toán.
    queueMicrotask(() => onExpiredRef.current());
  }
  if (!expired) expiredRef.current = false;
  return { remainingMs: Math.max(remainingMs, 0), expired };
}

export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
