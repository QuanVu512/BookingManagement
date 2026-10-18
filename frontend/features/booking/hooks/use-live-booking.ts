'use client';
import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { checkAvailability, createBooking } from '../api/booking-service';
import type { BookingWindow, LiveBookingState } from '../model/booking';
import { initialBookingWindow } from '../model/booking-time';
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

async function executeBooking(context: BookingContext, action: BookingAction) {
  const input = bookingRequestInput(
    {
      accountId: context.accountId,
      courtId: context.courtId,
      timezone: context.timezone,
      window: context.state.window,
    },
    context.request,
  );
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
    quoteAvailability: () => runBooking(context, 'quote'),
    createHold: () => runBooking(context, 'create'),
  };
}

function visibleState(state: InternalState, accountId?: string) {
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
