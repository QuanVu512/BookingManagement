'use client';

import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  getGuestHoldRecovery,
  type GuestHoldRecoverySnapshot,
} from '../api/payment-service';

export type RecoveryLinkStatus =
  | 'idle'
  | 'ready'
  | 'expired-hold'
  | 'expired-link'
  | 'invalid'
  | 'error';

export interface RecoveryLinkState {
  status: RecoveryLinkStatus;
  bookingId: string | null;
  token: string | null;
  snapshot: GuestHoldRecoverySnapshot | null;
  message: string;
  retry: () => void;
}

const INITIAL: RecoveryLinkState = {
  status: 'idle',
  bookingId: null,
  token: null,
  snapshot: null,
  message: '',
  retry: () => {},
};

function readFragmentToken(hash: string): string | null {
  if (!hash.startsWith('#')) return null;
  const params = new URLSearchParams(hash.slice(1));
  const token = params.get('recovery');
  return token && token.length >= 32 ? token : null;
}

/**
 * Task 5.2 — đọc link phục hồi từ email (AC-14/AC-16/AC-19).
 * - Token nằm ở fragment (`#recovery=`), không bao giờ lên query/log server.
 * - Mount: đọc `?recover=` (mã đơn, không bí mật) + `#recovery=` (mã bí mật),
 *   gọi ngay `history.replaceState` xóa cả hai khỏi thanh địa chỉ.
 * - Mã bí mật giữ trong bộ nhớ (state) và sessionStorage cùng tab để các lần
 *   đọc lại (polling/tải lại) dùng tiếp; không ghi localStorage.
 * - Đồng hồ đếm ngược luôn lấy `holdExpiresAt`/`serverNow` từ GET /recovery,
 *   không tự đặt `Date.now() + 5 phút`.
 */
type RecoveryLinkSetter = Dispatch<SetStateAction<RecoveryLinkState>>;

function fetchRecoverySnapshot(
  bookingId: string,
  token: string,
  setState: RecoveryLinkSetter,
) {
  void getGuestHoldRecovery(bookingId)
    .then((snapshot) => {
      if (
        snapshot.booking.status === 'HOLDING' &&
        snapshot.allowedActions.isHoldExpired
      ) {
        setState((previous) => ({
          ...previous,
          status: 'expired-hold',
          bookingId,
          token,
          snapshot,
          message: 'Đơn giữ chỗ đã hết hạn. Vui lòng đặt sân mới.',
        }));
      } else {
        // S5-07: terminal (CONFIRMED/CANCELLED/EXPIRED/REVIEW) và HOLDING còn
        // hạn đều mở ở trạng thái sẵn sàng kèm snapshot đúng; modal khóa
        // thao tác theo snapshot, không biến thanh toán thành công thành hết hạn.
        setState((previous) => ({
          ...previous,
          status: 'ready',
          bookingId,
          token,
          snapshot,
          message: '',
        }));
      }
    })
    .catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Không đọc được đơn.';
      const expired =
        /hết hạn|RECOVERY_TOKEN_EXPIRED|401|403/i.test(message);
      setState((previous) => ({
        ...previous,
        status: expired ? 'expired-link' : 'error',
        bookingId,
        token,
        snapshot: null,
        message: expired
          ? 'Liên kết đã hết hạn. Vui lòng đặt sân mới hoặc dùng trang Tra cứu.'
          : `${message} Vui lòng thử lại.`,
      }));
    });
}

export function useRecoveryLink(): RecoveryLinkState {
  const [state, setState] = useState<RecoveryLinkState>(INITIAL);
  const done = useRef(false);
  // S5-08: giữ identity trong bộ nhớ để thử lại GET mà không cần URL/token mới.
  const identityRef = useRef<{ bookingId: string; token: string } | null>(null);

  useEffect(() => {
    if (done.current || typeof window === 'undefined') return;
    done.current = true;
    const search = new URLSearchParams(window.location.search);
    const bookingId = search.get('recover');
    const token = readFragmentToken(window.location.hash);
    const legacyToken = search.get('token');

    // AC-19: xóa sạch mã khỏi thanh địa chỉ ngay khi đọc xong.
    const cleanSearch = new URLSearchParams(search);
    cleanSearch.delete('recover');
    cleanSearch.delete('token');
    const cleanQuery = cleanSearch.toString();
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ''}`,
    );

    if (!bookingId || !token) {
      if (legacyToken) {
        setState((previous) => ({
          ...previous,
          status: 'invalid',
          bookingId: null,
          token: null,
          snapshot: null,
          message:
            'Liên kết cũ không còn được hỗ trợ. Vui lòng dùng trang Tra cứu để nhận liên kết mới.',
        }));
        return;
      }
      return;
    }

    try {
      sessionStorage.setItem(`guest-checkout-token:${bookingId}`, token);
    } catch {
      // Tab riêng tư: vẫn giữ token trong bộ nhớ của hook.
    }
    identityRef.current = { bookingId, token };
    const retry = () => {
      const identity = identityRef.current;
      if (!identity) return;
      setState((previous) => ({ ...previous, status: 'ready', message: '' }));
      fetchRecoverySnapshot(identity.bookingId, identity.token, setState);
    };
    setState((previous) => ({
      ...previous,
      status: 'ready',
      bookingId,
      token,
      snapshot: null,
      message: '',
      retry,
    }));

    fetchRecoverySnapshot(bookingId, token, setState);
  }, []);

  return state;
}
