'use client';
import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  checkAvailability,
  createBooking,
  loadServiceProducts,
} from '../api/booking-service';
import type { BookingWindow, LiveBookingState } from '../model/booking';
import { MAX_SERVICE_QUANTITY, type ServiceProduct } from '../model/booking';
import { READ_REQUEST_TIMEOUT_MS } from '../../../constants/network';
import {
  initialBookingWindow,
  localInputToIso,
  assertBookableWindow,
  bookingDateBounds,
  BOOKING_REFRESH_MS,
} from '../model/booking-time';
import {
  bookingRequestInput,
  type RequestKeyState,
} from './booking-request-intent';

interface InternalState extends LiveBookingState {
  owner?: string;
}
interface BookingContext {
  state: InternalState;
  update: Dispatch<SetStateAction<InternalState>>;
  request: RequestKeyState & { locked: boolean; mounted: boolean };
  courtId: string;
  timezone: string;
  accountId?: string;
}
type BookingAction = 'quote' | 'create';

export function useBookingDateBounds(timezone: string) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = setInterval(refresh, BOOKING_REFRESH_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return bookingDateBounds(timezone, now);
}

async function executeBooking(context: BookingContext, action: BookingAction) {
  assertBookableWindow(context.state.window, context.timezone);
  const input = bookingRequestInput(
    {
      accountId: context.accountId,
      courtId: context.courtId,
      timezone: context.timezone,
      window: context.state.window,
      services: context.state.services,
    },
    context.request,
  );
  if (action === 'quote')
    return {
      quote: await checkAvailability(
        input.courtId,
        input.startsAt,
        input.endsAt,
        input.services,
      ),
      booking: undefined,
    };
  return { booking: await createBooking(input), quote: undefined };
}
async function runBooking(context: BookingContext, action: BookingAction) {
  if (context.request.locked) return;
  context.request.locked = true;
  context.update((previous) => ({ ...previous, busy: true, error: '' }));
  try {
    const result = await executeBooking(context, action);
    if (context.request.mounted)
      context.update((previous) => ({
        ...previous,
        ...result,
        canRetry: action === 'create' ? false : previous.canRetry,
        owner: context.accountId,
      }));
  } catch (reason: unknown) {
    setBookingFailure(context, reason, action);
  } finally {
    context.request.locked = false;
    if (context.request.mounted)
      context.update((previous) => ({ ...previous, busy: false }));
  }
}
function changeWindow(context: BookingContext, window: BookingWindow) {
  if (context.request.locked) return;
  context.request.fingerprint = '';
  context.update({
    window,
    services: context.state.services ?? [],
    busy: false,
    error: '',
    canRetry: false,
    owner: context.accountId,
  });
}

export function useLiveBooking(
  courtId: string,
  timezone: string,
  accountId?: string,
) {
  const [state, update] = useState<InternalState>(() => ({
    services: [],
    window: initialBookingWindow(timezone),
    busy: false,
    error: '',
    canRetry: false,
    owner: accountId,
  }));
  const request = useRequestLifecycle();
  const context = {
    state,
    update,
    request: request.current,
    courtId,
    timezone,
    accountId,
  };
  return {
    ...visibleState(state, accountId),
    changeWindow: (window: BookingWindow) => changeWindow(context, window),
    changeService: (productId: string, quantity: number) =>
      changeService(context, productId, quantity),
    quoteAvailability: () => runBooking(context, 'quote'),
    createHold: () => runBooking(context, 'create'),
  };
}

function visibleState(state: InternalState, accountId?: string) {
  const visible = state.owner === accountId;
  return {
    window: state.window,
    services: state.services ?? [],
    busy: state.busy,
    error: visible ? state.error : '',
    quote: visible ? state.quote : undefined,
    booking: visible ? state.booking : undefined,
    canRetry: visible && state.canRetry,
  };
}

function useRequestLifecycle() {
  const request = useRef<BookingContext['request']>({
    locked: false,
    mounted: true,
    fingerprint: '',
    key: '',
  });
  useEffect(() => {
    request.current.mounted = true;
    return () => {
      request.current.mounted = false;
    };
  }, []);
  return request;
}
function setBookingFailure(
  context: BookingContext,
  reason: unknown,
  action: BookingAction,
) {
  const error =
    reason instanceof Error &&
    !(reason instanceof TypeError) &&
    !(reason instanceof DOMException)
      ? reason.message
      : 'Mất kết nối. Hãy thử lại yêu cầu hoặc xem Booking của tôi.';
  if (context.request.mounted)
    context.update((previous) => ({
      ...previous,
      error,
      quote: undefined,
      canRetry: action === 'create' || previous.canRetry,
      owner: context.accountId,
    }));
}

function changeService(
  context: BookingContext,
  productId: string,
  quantity: number,
) {
  if (
    context.request.locked ||
    !Number.isInteger(quantity) ||
    quantity < 0 ||
    quantity > MAX_SERVICE_QUANTITY
  )
    return;
  const services = (context.state.services ?? []).filter(
    (item) => item.productId !== productId,
  );
  if (quantity > 0) services.push({ productId, quantity });
  context.request.fingerprint = '';
  context.update({
    window: context.state.window,
    services,
    busy: false,
    error: '',
    canRetry: false,
    owner: context.accountId,
  });
}

interface ServiceCatalogState {
  products: ServiceProduct[];
  loading: boolean;
  error: string;
}

async function readServiceCatalog(
  courtId: string,
  controller: AbortController,
  update: Dispatch<SetStateAction<ServiceCatalogState>>,
  bookingWindow?: BookingWindow,
  timezone?: string,
) {
  try {
    if (bookingWindow && timezone)
      assertBookableWindow(bookingWindow, timezone);
    const products = await loadServiceProducts(
      courtId,
      AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(READ_REQUEST_TIMEOUT_MS),
      ]),
      bookingWindow && timezone
        ? {
            startsAt: localInputToIso(bookingWindow.start, timezone),
            endsAt: localInputToIso(bookingWindow.end, timezone),
          }
        : undefined,
    );
    if (!controller.signal.aborted)
      update({ products, loading: false, error: '' });
  } catch {
    if (!controller.signal.aborted)
      update({
        products: [],
        loading: false,
        error: 'Chưa tải được dịch vụ. Vui lòng thử lại.',
      });
  }
}

export function useServiceCatalog(
  courtId: string,
  bookingWindow?: BookingWindow,
  timezone?: string,
) {
  const [catalog, setCatalog] = useState<ServiceCatalogState>({
    products: [],
    loading: true,
    error: '',
  });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setCatalog({ products: [], loading: true, error: '' });
    void readServiceCatalog(
      courtId,
      controller,
      setCatalog,
      bookingWindow,
      timezone,
    );
    return () => controller.abort();
  }, [courtId, revision, bookingWindow?.start, bookingWindow?.end, timezone]);
  return { ...catalog, retry: () => setRevision((current) => current + 1) };
}
