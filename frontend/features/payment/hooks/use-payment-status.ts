'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createPaymentRequest,
  createGuestPrepaymentRequest,
  getPaymentOutcome,
  getPaymentRequest,
  getGuestHoldRecovery,
  type GuestHoldRecoverySnapshot,
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
  /** Snapshot recovery server-authoritative (chỉ có ở chế độ resume). */
  recovery: GuestHoldRecoverySnapshot | null;
}
const CHECKOUT_POLL_MS = 3000;

async function readCheckout(
  requestId: string,
  signal: AbortSignal,
  update: (state: Partial<CheckoutState>) => void,
  bookingId?: string,
) {
  let guestToken: string | undefined;
  if (bookingId && typeof window !== 'undefined') {
    try {
      guestToken =
        sessionStorage.getItem(`guest-manage-token:${bookingId}`) || undefined;
      if (!guestToken) {
        const pendingRaw = localStorage.getItem('pending_booking');
        if (pendingRaw) {
          const pending = JSON.parse(pendingRaw);
          if (pending.bookingId === bookingId && pending.accessToken) {
            guestToken = pending.accessToken;
            sessionStorage.setItem(
              `guest-manage-token:${bookingId}`,
              pending.accessToken,
            );
          }
        }
      }
    } catch {}
  }
  const [request, outcome] = await Promise.all([
    getPaymentRequest(requestId, signal, guestToken),
    getPaymentOutcome(requestId, signal, guestToken),
  ]);
  if (!signal.aborted) update({ request, outcome, error: '' });
  // Task 3.3: dừng poll khi request đã terminal (FAILED cần retry chủ động)
  // hoặc outcome đã rời SCR_PENDING.
  return outcome.screen !== 'SCR_PENDING' || TERMINAL.includes(request.status);
}

type CheckoutUpdate = (state: Partial<CheckoutState>) => void;
function checkoutPoller(
  controller: AbortController,
  update: CheckoutUpdate,
  bookingId: string,
  shouldStopPolling?: () => boolean,
) {
  let timer: ReturnType<typeof setTimeout>;
  const poll = async (requestId: string) => {
    try {
      if (await readCheckout(requestId, controller.signal, update, bookingId))
        return;
    } catch {
      if (!controller.signal.aborted)
        update({ error: 'Chưa cập nhật được thanh toán. Vui lòng thử lại.' });
    }
    if (!controller.signal.aborted && !shouldStopPolling?.())
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
    let guestToken: string | undefined;
    if (typeof window !== 'undefined') {
      try {
        guestToken =
          sessionStorage.getItem(`guest-manage-token:${bookingId}`) ||
          undefined;
      } catch {
        // ignore
      }
    }
    const request = await createPaymentRequest({
      bookingId,
      purpose: 'PREPAYMENT',
      prepaymentPercent: 30,
      method: 'PAYOS_TRANSFER',
      idempotencyKey: `booking-checkout:${bookingId}`,
      signal: controller.signal,
      guestToken,
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
  onPollerStopReady?: (stop: () => void) => void,
  shouldStopPolling?: () => boolean,
) {
  const { poll, stop } = checkoutPoller(
    controller,
    update,
    bookingId,
    shouldStopPolling,
  );
  onPollerStopReady?.(stop);
  void createCheckout(bookingId, controller, update, poll);
  return () => {
    controller.abort();
    stop();
  };
}

export function checkoutPresentation(checkout: CheckoutState) {
  const success =
    (checkout.outcome !== null && isPaymentSuccess(checkout.outcome)) ||
    checkout.request?.status === 'PAID';
  const bookingStatus = checkout.outcome?.bookingStatus;
  // F4: booking terminal do server báo phải khóa QR/thanh toán, kể cả khi
  // payload/link cũ vẫn còn trong DB.
  const terminal =
    checkout.outcome?.screen === 'SCR05_EXPIRED' ||
    checkout.outcome?.screen === 'SCR_CANCELLED' ||
    bookingStatus === 'CANCELLED' ||
    bookingStatus === 'EXPIRED' ||
    bookingStatus === 'CHECKED_IN' ||
    bookingStatus === 'COMPLETED' ||
    bookingStatus === 'NO_SHOW';
  const reviewRequired = Boolean(checkout.outcome?.reviewRequired);
  const paymentTerminal =
    checkout.request?.status === 'CANCELLED' ||
    checkout.request?.status === 'EXPIRED';
  return {
    success,
    terminal,
    reviewRequired,
    paymentTerminal,
    canPay:
      !success &&
      !terminal &&
      !reviewRequired &&
      !paymentTerminal &&
      checkout.request?.status !== 'PAID',
    title: success
      ? 'Đặt sân thành công'
      : terminal
        ? 'Đơn đã kết thúc'
        : reviewRequired
          ? 'Đang kiểm tra thanh toán'
          : 'Thanh toán đặt cọc 30%',
  };
}

/**
 * STEP4-P1-2 — Ánh xạ snapshot recovery sang state hiển thị của modal QR.
 * Dữ liệu đã server-authoritative (booking/payment/allowedActions); không suy
 * trạng thái từ đồng hồ client.
 */
function resumeSnapshotToState(
  snapshot: GuestHoldRecoverySnapshot,
): Partial<CheckoutState> {
  const payment = snapshot.payment;
  // RECHECK-03: outcome suy từ cả booking/serverClock/allowedActions, độc lập
  // với việc có payment. Đơn terminal (CANCELLED/EXPIRED) hoặc hold đã hết
  // theo giờ máy chủ phải khóa thao tác dù chưa từng có payment.
  const bookingStatus = snapshot.booking.status;
  const holdExpiredByServer =
    bookingStatus === 'HOLDING' && snapshot.serverClock.isHoldExpired;
  const terminalScreen =
    bookingStatus === 'CANCELLED'
      ? 'SCR_CANCELLED'
      : bookingStatus === 'EXPIRED' || holdExpiredByServer
        ? 'SCR05_EXPIRED'
        : 'SCR_PENDING';
  return {
    request: payment
      ? {
          id: payment.requestId,
          paymentCode: snapshot.booking.code,
          purpose: 'PREPAYMENT',
          amount: payment.amount,
          currency: 'VND',
          method: 'PAYOS_TRANSFER',
          providerOrderCode: null,
          checkoutUrl: payment.checkoutUrl ?? null,
          status: payment.status as PaymentRequestRecord['status'],
          expiresAt: snapshot.booking.holdExpiresAt,
          vietQrPayload: payment.vietQrPayload ?? null,
          reviewRequired: payment.requiresReview,
          reviewReasonCode: null,
        }
      : null,
    outcome: {
      serverNow: snapshot.serverClock.serverNow,
      screen: payment
        ? (payment.outcomeScreen as PaymentOutcome['screen'])
        : (terminalScreen as PaymentOutcome['screen']),
      reviewRequired: payment
        ? payment.requiresReview
        : snapshot.allowedActions.requiresReview,
      reviewReasonCode: null,
      bookingStatus,
      netCredited: 0,
      requiredPrepaymentAmount: snapshot.booking.prepaymentAmount,
    },
    recovery: snapshot,
  };
}

/**
 * S5-01 — poll resume bằng GET recovery dưới quyền checkout token.
 * Tab sạch từ email không có ManageToken nên không được gọi API member
 * (`/api/payments/requests/*`); mọi lần đọc đều đi `GET /recovery` và dừng ở
 * trạng thái kết thúc/thành công/đối soát do server xác nhận.
 */
function resumeRecoveryPoller(
  bookingId: string,
  controller: AbortController,
  guardedUpdate: CheckoutUpdate,
  shouldStopPolling?: () => boolean,
  intervalMs = 3000,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const stop = () => {
    stopped = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const poll = async () => {
    try {
      const snapshot = await getGuestHoldRecovery(bookingId, controller.signal);
      if (controller.signal.aborted) return;
      const mapped = {
        ...resumeSnapshotToState(snapshot),
        loading: false,
        error: '',
      };
      const mappedRequest = mapped.request ?? null;
      const mappedOutcome = mapped.outcome ?? null;
      const presentation = checkoutPresentation({
        request: mappedRequest,
        outcome: mappedOutcome,
        loading: false,
        error: '',
        recovery: snapshot,
      });
      guardedUpdate({
        ...mapped,
        request: mappedRequest,
        outcome: mappedOutcome,
      });
      if (
        presentation.success ||
        presentation.terminal ||
        presentation.reviewRequired ||
        presentation.paymentTerminal
      ) {
        return;
      }
    } catch {
      if (controller.signal.aborted) return;
      guardedUpdate({
        loading: false,
        error: 'Chưa cập nhật được thanh toán. Vui lòng thử lại.',
      });
    }
    if (controller.signal.aborted || stopped || shouldStopPolling?.()) return;
    timer = setTimeout(() => {
      void poll();
    }, intervalMs);
  };
  void poll();
  return { stop };
}

function readResumeCheckoutToken(bookingId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return (
      sessionStorage.getItem(`guest-checkout-token:${bookingId}`) ??
      sessionStorage.getItem(`guest-manage-token:${bookingId}`)
    );
  } catch {
    return null;
  }
}

/**
 * S5-01 — tạo mới chủ động ở chế độ resume qua endpoint checkout token
 * (`POST /api/guest/bookings/:bookingId/payment-requests`), không qua API
 * member. Quyền CREATE_PREPAYMENT do server kiểm tra theo token đã bind đúng
 * đơn và cửa sổ giữ chỗ còn hạn; khóa idempotency chuẩn của booking nên retry
 * không sinh yêu cầu trùng. Xong thì quay lại poll recovery để đồng bộ.
 */
function startResumeCreate(
  bookingId: string,
  controller: AbortController,
  guardedUpdate: CheckoutUpdate,
  onPollerStopReady?: (stop: () => void) => void,
  shouldStopPolling?: () => boolean,
) {
  let stopPoller: (() => void) | null = null;
  const checkoutToken = readResumeCheckoutToken(bookingId);
  if (!checkoutToken) {
    guardedUpdate({
      loading: false,
      error: 'Phiên khôi phục đã hết. Vui lòng tải lại trang và mở link mới.',
    });
    return () => {
      controller.abort();
      stopPoller?.();
    };
  }
  void createGuestPrepaymentRequest({
    bookingId,
    checkoutToken,
    signal: controller.signal,
  })
    .then((request) => {
      if (controller.signal.aborted) return;
      guardedUpdate({ request, loading: false, error: '' });
      if (shouldStopPolling?.()) return;
      const { stop } = resumeRecoveryPoller(
        bookingId,
        controller,
        guardedUpdate,
        shouldStopPolling,
      );
      stopPoller = stop;
      onPollerStopReady?.(stop);
    })
    .catch(() => {
      if (controller.signal.aborted) return;
      guardedUpdate({
        loading: false,
        error: 'Chưa tạo được mã thanh toán. Vui lòng thử lại.',
      });
    });
  return () => {
    controller.abort();
    stopPoller?.();
  };
}

/**
 * STEP4-P1-2 — Resume chỉ-đọc: GET recovery rồi poll GET recovery (S5-01).
 * Tuyệt đối không POST trên đường này; tạo mới chỉ khi `createArmed` do
 * người dùng bấm retry mà recovery cho phép (chưa từng có provider link hoặc
 * payment FAILED được tạo lại).
 */
function startResumeReadonly(
  bookingId: string,
  controller: AbortController,
  guardedUpdate: CheckoutUpdate,
  onPollerStopReady?: (stop: () => void) => void,
  shouldStopPolling?: () => boolean,
) {
  let stopPoller: (() => void) | null = null;
  void getGuestHoldRecovery(bookingId, controller.signal)
    .then((snapshot) => {
      if (controller.signal.aborted) return;
      guardedUpdate({
        ...resumeSnapshotToState(snapshot),
        loading: false,
        error: '',
      });
      if (shouldStopPolling?.()) return;
      // S5-01: poll tiếp bằng GET recovery (quyền checkout token), không dùng
      // API member cần ManageToken mà tab sạch không có.
      const { stop } = resumeRecoveryPoller(
        bookingId,
        controller,
        guardedUpdate,
        shouldStopPolling,
      );
      stopPoller = stop;
      onPollerStopReady?.(stop);
    })
    .catch(() => {
      if (controller.signal.aborted) return;
      guardedUpdate({
        loading: false,
        error: 'Chưa đọc được trạng thái đơn. Vui lòng thử lại.',
      });
    });
  return () => {
    controller.abort();
    stopPoller?.();
  };
}
export function useBookingCheckout(
  bookingId: string,
  options?: { resumeOnly?: boolean },
) {
  const [state, setState] = useState<CheckoutState>({
    request: null,
    outcome: null,
    loading: true,
    error: '',
    recovery: null,
  });
  const [revision, setRevision] = useState(0);
  const requestIdRef = useRef<string | null>(null);
  const resumeOnlyRef = useRef(options?.resumeOnly === true);
  resumeOnlyRef.current = options?.resumeOnly === true;
  // STEP4-P1-2: user bấm retry khi resume cho thấy chưa có provider link và
  // được phép tạo → cho phép đúng một POST tạo mới ở lần chạy effect kế tiếp.
  const createArmedRef = useRef(false);
  // FINAL-03: dừng chuỗi poll tự động khi hết thời gian hiển thị hoặc đơn đã hủy.
  const pollingPausedRef = useRef(false);
  const stopPollerRef = useRef<(() => void) | null>(null);
  // REM-01: giữ controller của effect khởi động và cờ hủy đã xác nhận để
  // bất kỳ phản hồi GET/POST nào bắt đầu trước khi hủy không thể ghi đè
  // trạng thái kết thúc (CANCELLED) khi về muộn.
  const effectControllerRef = useRef<AbortController | null>(null);
  const cancelledLockedRef = useRef(false);
  // R3-P2-1: subject facts (booking + revision) để guard mọi async write của
  // đường đọc — response cũ không được ghi đè state của subject mới.
  const subjectRef = useRef({ bookingId, revision });
  const inflightRef = useRef(new Set<AbortController>());
  useEffect(() => {
    requestIdRef.current = state.request?.id ?? null;
  }, [state.request?.id]);
  // STEP4-P1-2: ảnh mới nhất của recovery để nút retry quyết định có arm POST.
  const lastRecoveryRef = useRef<GuestHoldRecoverySnapshot | null>(null);
  useEffect(() => {
    lastRecoveryRef.current = state.recovery;
  }, [state.recovery]);
  useEffect(() => {
    subjectRef.current = { bookingId, revision };
  });
  useEffect(() => {
    pollingPausedRef.current = false;
    cancelledLockedRef.current = false;
    stopPollerRef.current = null;
    const controller = new AbortController();
    effectControllerRef.current = controller;
    const subject = { bookingId, revision };
    const shouldStopPolling = () =>
      pollingPausedRef.current || cancelledLockedRef.current;
    const setPollerStop = (stop: () => void) => {
      stopPollerRef.current = stop;
    };
    const guardedUpdate = (patch: Partial<CheckoutState>) => {
      if (
        controller.signal.aborted ||
        cancelledLockedRef.current ||
        subjectRef.current.bookingId !== subject.bookingId ||
        subjectRef.current.revision !== subject.revision
      ) {
        return;
      }
      setState((previous) => ({ ...previous, ...patch }));
    };
    setState({
      request: null,
      outcome: null,
      loading: true,
      error: '',
      recovery: null,
    });
    if (resumeOnlyRef.current) {
      // S5-01: resume chỉ GET recovery; đúng một POST tạo mới qua endpoint
      // checkout token khi user đã bấm retry mà recovery cho phép.
      if (createArmedRef.current) {
        createArmedRef.current = false;
        return startResumeCreate(
          bookingId,
          controller,
          guardedUpdate,
          setPollerStop,
          shouldStopPolling,
        );
      }
      return startResumeReadonly(
        bookingId,
        controller,
        guardedUpdate,
        setPollerStop,
        shouldStopPolling,
      );
    }
    return startCheckout(
      bookingId,
      controller,
      guardedUpdate,
      setPollerStop,
      shouldStopPolling,
    );
  }, [bookingId, revision]);
  // Abort mọi GET-read đang bay khi đổi subject hoặc unmount — cùng với
  // generation guard bên dưới (abort không đủ nếu response đã hoàn tất).
  useEffect(() => {
    const live = inflightRef.current;
    return () => {
      live.forEach((entry) => entry.abort());
      live.clear();
    };
  }, [bookingId, revision]);
  // R2-P2-1 + STEP4-P1-2: refreshRead chỉ đọc, không POST tạo mới.
  // Countdown hết hạn và mọi trạng thái khóa dùng đường này; ở chế độ resume
  // thì đọc lại recovery (GET) thay vì request/outcome theo request id. Chỉ
  // retry chủ động sau FAILED mới được gọi refresh (re-POST cùng intent).
  const refreshRead = useCallback((simulatedResult?: unknown) => {
    if (cancelledLockedRef.current) return;
    const subject = subjectRef.current;
    const isStale = () =>
      cancelledLockedRef.current ||
      subjectRef.current.bookingId !== subject.bookingId ||
      subjectRef.current.revision !== subject.revision;
    const guardedUpdate = (patch: Partial<CheckoutState>) => {
      if (isStale()) return;
      setState((previous) => ({ ...previous, ...patch }));
    };

    // Khi người dùng bấm nút Demo mô phỏng thanh toán thành công,
    // áp dụng ngay trạng thái thành công để giao diện tức thời chuyển sang xanh lá.
    const isSimulatePayload = Boolean(
      simulatedResult &&
      typeof simulatedResult === 'object' &&
      !('nativeEvent' in (simulatedResult as Record<string, unknown>)) &&
      ('status' in (simulatedResult as Record<string, unknown>) ||
        'outcome' in (simulatedResult as Record<string, unknown>) ||
        'data' in (simulatedResult as Record<string, unknown>)),
    );
    if (isSimulatePayload) {
      const res = simulatedResult as {
        outcome?: PaymentOutcome;
        data?: { outcome?: PaymentOutcome };
      };
      const outcome = res.outcome ??
        res.data?.outcome ?? {
          screen: 'SCR04_SUCCESS',
          bookingStatus: 'CONFIRMED',
          reviewRequired: false,
          reviewReasonCode: null,
          netCredited: 0,
          requiredPrepaymentAmount: 0,
          serverNow: new Date().toISOString(),
        };
      guardedUpdate({
        outcome: outcome as PaymentOutcome,
        request: state.request ? { ...state.request, status: 'PAID' } : null,
        error: '',
        loading: false,
      });
      return;
    }

    // Đọc lại trạng thái mới: xóa cờ lỗi cũ
    guardedUpdate({ error: '' });
    if (resumeOnlyRef.current) {
      const controller = new AbortController();
      inflightRef.current.add(controller);
      void getGuestHoldRecovery(subject.bookingId, controller.signal)
        .then((snapshot) => {
          if (controller.signal.aborted || isStale()) return;
          guardedUpdate({
            ...resumeSnapshotToState(snapshot),
            loading: false,
            error: '',
          });
        })
        .catch(() => {
          if (controller.signal.aborted || isStale()) return;
          guardedUpdate({
            loading: false,
            error: 'Chưa đọc được trạng thái đơn. Vui lòng thử lại.',
          });
        })
        .finally(() => {
          inflightRef.current.delete(controller);
        });
      return;
    }
    const id = requestIdRef.current;
    if (!id) return;
    const readController = new AbortController();
    inflightRef.current.add(readController);
    const readIsStale = () =>
      readController.signal.aborted ||
      cancelledLockedRef.current ||
      subjectRef.current.bookingId !== subject.bookingId ||
      subjectRef.current.revision !== subject.revision;
    const readGuardedUpdate = (patch: Partial<CheckoutState>) => {
      if (readIsStale()) return;
      setState((previous) => ({ ...previous, ...patch }));
    };
    // R3-P2-2: GET lỗi phải được catch trong lifecycle owner — giữ snapshot
    // hợp lệ, báo lỗi đọc; aborted/stale thì im lặng, không ghi sang subject
    // mới. Không chuyển sang POST để xử lý lỗi GET.
    void readCheckout(
      id,
      readController.signal,
      readGuardedUpdate,
      subject.bookingId,
    )
      .catch(() => {
        if (readIsStale()) return;
        setState((previous) => ({
          ...previous,
          error: 'Chưa cập nhật được thanh toán. Vui lòng thử lại.',
        }));
      })
      .finally(() => {
        inflightRef.current.delete(readController);
      });
  }, []);
  // STEP4-P1-2 + RECHECK-02: refresh ở chế độ resume chỉ đọc lại recovery,
  // trừ khi user bấm retry mà recovery cho phép (chưa có provider link, hoặc
  // payment FAILED được tạo lại cùng yêu cầu/idempotency) → đúng một POST
  // tạo mới do thao tác chủ động, các lần sau lại chỉ GET.
  const refresh = useCallback(() => {
    if (resumeOnlyRef.current) {
      // Chỉ arm POST khi recovery cho phép; mọi trường hợp khác vẫn chỉ GET.
      const snapshot = lastRecoveryRef.current;
      const retryFailed =
        snapshot?.payment?.status === 'FAILED' &&
        snapshot.allowedActions.canCreatePayment === true;
      const createFresh =
        snapshot !== null &&
        !snapshot.payment &&
        snapshot.allowedActions.canCreatePayment === true;
      if (retryFailed || createFresh) {
        createArmedRef.current = true;
      }
    }
    setRevision((previous) => previous + 1);
  }, []);
  const presentation = checkoutPresentation(state);
  // STEP4-P1-2:Resume chưa có payment nhưng được phép tạo → hiện nút "Tạo mã
  // QR" cho thao tác chủ động của user (không tự POST khi mount).
  const resumeCanCreate =
    resumeOnlyRef.current &&
    !state.loading &&
    !state.error &&
    state.recovery !== null &&
    state.recovery.payment === null &&
    state.recovery.allowedActions.canCreatePayment === true &&
    !presentation.terminal &&
    !presentation.reviewRequired &&
    !presentation.success;
  return {
    ...state,
    ...presentation,
    resumeCanCreate,
    refresh,
    refreshRead,
    pausePolling: useCallback(() => {
      pollingPausedRef.current = true;
      stopPollerRef.current?.();
    }, []),
    markCancelled: useCallback(() => {
      cancelledLockedRef.current = true;
      pollingPausedRef.current = true;
      stopPollerRef.current?.();
      effectControllerRef.current?.abort();
      const subject = subjectRef.current;
      inflightRef.current.forEach((entry) => entry.abort());
      inflightRef.current.clear();
      setState((previous) => {
        if (
          subjectRef.current.bookingId !== subject.bookingId ||
          subjectRef.current.revision !== subject.revision
        ) {
          return previous;
        }
        return {
          ...previous,
          loading: false,
          error: '',
          request: previous.request
            ? { ...previous.request, status: 'CANCELLED' }
            : null,
          outcome: {
            serverNow: previous.outcome?.serverNow ?? new Date().toISOString(),
            screen: 'SCR_CANCELLED',
            reviewRequired: false,
            reviewReasonCode: null,
            bookingStatus: 'CANCELLED',
            netCredited: previous.outcome?.netCredited ?? 0,
            requiredPrepaymentAmount:
              previous.outcome?.requiredPrepaymentAmount ?? 0,
          },
          recovery: previous.recovery
            ? {
                ...previous.recovery,
                booking: {
                  ...previous.recovery.booking,
                  status: 'CANCELLED',
                },
                allowedActions: {
                  ...previous.recovery.allowedActions,
                  canCancelHold: false,
                  canCreatePayment: false,
                  canShowQr: false,
                  canPay: false,
                },
              }
            : null,
        };
      });
    }, []),
  };
}
