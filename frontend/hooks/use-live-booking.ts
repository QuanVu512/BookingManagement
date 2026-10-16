'use client';
import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { checkAvailability, createBooking } from '../services/bookings';
import type { Availability, BookingRecord } from '../types/booking';
import { initialBookingWindow, localInputToIso } from '../lib/booking-time';

type BookingWindow = ReturnType<typeof initialBookingWindow>;
interface LiveState {
  window: BookingWindow;
  quote?: Availability;
  booking?: BookingRecord;
  owner?: string;
  error: string;
  busy: boolean;
  canRetry?: boolean;
}
interface RequestState {
  locked: boolean;
  mounted: boolean;
  fingerprint: string;
  key: string;
}
interface BookingContext {
  state: LiveState;
  update: Dispatch<SetStateAction<LiveState>>;
  request: RequestState;
  courtId: string;
  timezone: string;
  accountId?: string;
}

function requestIdentity(context: BookingContext) {
  const startsAt = localInputToIso(
    context.state.window.start,
    context.timezone,
  );
  const endsAt = localInputToIso(context.state.window.end, context.timezone);
  const fingerprint = JSON.stringify([
    context.accountId,
    context.courtId,
    startsAt,
    endsAt,
  ]);
  if (context.request.fingerprint !== fingerprint) {
    context.request.fingerprint = fingerprint;
    context.request.key = crypto.randomUUID();
  }
  return {
    policyAccepted: true as const,
    courtId: context.courtId,
    startsAt,
    endsAt,
    idempotencyKey: context.request.key,
  };
}
async function executeBooking(
  context: BookingContext,
  action: 'quote' | 'create',
) {
  const input = requestIdentity(context);
  if (action === 'quote')
    return {
      quote: await checkAvailability(
        input.courtId,
        input.startsAt,
        input.endsAt,
      ),
      booking: undefined,
    };
  return { booking: await createBooking(input), quote: undefined };
}
async function runBooking(context: BookingContext, action: 'quote' | 'create') {
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
  context.update({ window, busy: false, error: '', owner: context.accountId });
}

export function useLiveBooking(
  courtId: string,
  timezone: string,
  accountId?: string,
) {
  const [state, update] = useState<LiveState>(() => ({
    window: initialBookingWindow(timezone),
    busy: false,
    error: '',
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
    run: (action: 'quote' | 'create') => runBooking(context, action),
  };
}

function visibleState(state: LiveState, accountId?: string) {
  const visible = state.owner === accountId;
  return {
    window: state.window,
    busy: state.busy,
    error: visible ? state.error : '',
    quote: visible ? state.quote : undefined,
    booking: visible ? state.booking : undefined,
    canRetry: visible && state.canRetry,
  };
}

function useRequestLifecycle() {
  const request = useRef<RequestState>({
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
  action: 'quote' | 'create',
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
