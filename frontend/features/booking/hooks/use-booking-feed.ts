'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { myBookings } from '../api/booking-service';
import type { BookingRecord } from '../model/booking';
import { BOOKING_REFRESH_MS } from '../model/booking-time';

interface BookingFeedState {
  records: BookingRecord[];
  error: string;
  loading: boolean;
  cursor: string | null;
  owner?: string;
}
const emptyFeed: BookingFeedState = {
  records: [],
  error: '',
  loading: false,
  cursor: null,
};

export function useBookingFeed(accountId?: string) {
  const [state, update] = useState<BookingFeedState>(emptyFeed);
  const revision = useRef(0);
  const lifecycle = useMemo(() => ({ active: true }), [accountId]);
  const reload = useCallback(
    async (cursor?: string) => {
      if (!accountId || !lifecycle.active) return;
      const current = ++revision.current;
      update((previous) => ({ ...previous, loading: true }));
      try {
        const result = await myBookings(undefined, cursor);
        if (current === revision.current)
          update((previous) => ({
            records: cursor
              ? [...previous.records, ...result.data]
              : result.data,
            cursor: result.nextCursor,
            error: '',
            loading: false,
            owner: accountId,
          }));
      } catch (reason: unknown) {
        if (current === revision.current)
          update((previous) => ({
            ...previous,
            loading: false,
            error:
              reason instanceof Error
                ? reason.message
                : 'Không tải được booking.',
          }));
      }
    },
    [accountId, lifecycle],
  );
  useBookingRefresh(accountId, reload, update, lifecycle);
  const fail = useCallback(
    (message: string) => {
      update((previous) => ({ ...previous, error: message }));
    },
    [update],
  );
  return {
    state,
    reload,
    fail,
    beginRevision: () => ++revision.current,
    isCurrent: (value: number) => value === revision.current,
    isActive: () => lifecycle.active,
  };
}

function useBookingRefresh(
  accountId: string | undefined,
  reload: (cursor?: string) => Promise<void>,
  update: Dispatch<SetStateAction<BookingFeedState>>,
  lifecycle: { active: boolean },
) {
  useEffect(() => {
    lifecycle.active = true;
    update({ ...emptyFeed, owner: accountId });
    if (!accountId) return;
    void reload();
    const refresh = () => void reload();
    const timer = setInterval(refresh, BOOKING_REFRESH_MS);
    window.addEventListener('online', refresh);
    return () => {
      lifecycle.active = false;
      clearInterval(timer);
      window.removeEventListener('online', refresh);
    };
  }, [accountId, reload, update, lifecycle]);
}
