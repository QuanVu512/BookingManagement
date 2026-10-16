'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { cancelBooking, myBookings } from '../services/bookings';
import type { BookingRecord } from '../types/booking';
import { BOOKING_REFRESH_MS } from '../lib/booking-time';

interface BookingFeed {
  records: BookingRecord[];
  error: string;
  loading: boolean;
  cursor: string | null;
  owner?: string;
}
interface FeedContext {
  update: Dispatch<SetStateAction<BookingFeed>>;
  revision: { current: number };
  lifecycle: { active: boolean };
  owner?: string;
}
const emptyFeed: BookingFeed = {
  records: [],
  error: '',
  loading: false,
  cursor: null,
};

async function loadPage(context: FeedContext, cursor?: string) {
  if (!context.owner || !context.lifecycle.active) return;
  const current = ++context.revision.current;
  context.update((previous) => ({ ...previous, loading: true }));
  try {
    const result = await myBookings(undefined, cursor);
    if (current === context.revision.current)
      context.update((previous) => ({
        records: cursor ? [...previous.records, ...result.data] : result.data,
        cursor: result.nextCursor,
        error: '',
        loading: false,
        owner: context.owner,
      }));
  } catch (reason: unknown) {
    if (current === context.revision.current)
      context.update((previous) => ({
        ...previous,
        loading: false,
        error:
          reason instanceof Error ? reason.message : 'Không tải được booking.',
      }));
  }
}
function useBookingPolling(
  context: FeedContext,
  reload: (cursor?: string) => Promise<void>,
) {
  const { owner, update, revision, lifecycle } = context;
  useEffect(() => {
    lifecycle.active = true;
    update({ ...emptyFeed, owner });
    if (!owner) return;
    void reload();
    const refresh = () => void reload();
    const timer = setInterval(refresh, BOOKING_REFRESH_MS);
    window.addEventListener('online', refresh);
    return () => {
      lifecycle.active = false;
      revision.current++;
      clearInterval(timer);
      window.removeEventListener('online', refresh);
    };
  }, [owner, reload, update, revision, lifecycle]);
}
function useBookingFeed(owner?: string) {
  const [state, update] = useState(emptyFeed);
  const revision = useRef(0);
  const lifecycle = useMemo(() => ({ active: true }), [owner]);
  const context = { owner, update, revision, lifecycle };
  const reload = useCallback(
    (cursor?: string) =>
      loadPage({ owner, update, revision, lifecycle }, cursor),
    [owner, lifecycle],
  );
  useBookingPolling(context, reload);
  return { state, context, reload };
}
async function performCancellation(
  feed: ReturnType<typeof useBookingFeed>,
  id: string,
) {
  const current = ++feed.context.revision.current;
  try {
    await cancelBooking(id);
    if (feed.context.lifecycle.active) await feed.reload();
  } catch (reason: unknown) {
    if (current === feed.context.revision.current)
      feed.context.update((previous) => ({
        ...previous,
        error:
          reason instanceof Error
            ? reason.message
            : 'Chưa xác nhận được kết quả hủy. Hãy tải lại.',
      }));
  }
}
function useBookingCancellation(feed: ReturnType<typeof useBookingFeed>) {
  const [pendingId, setPendingId] = useState('');
  const locked = useRef(false);
  useEffect(() => setPendingId(''), [feed.context.owner]);
  const cancel = async (id: string) => {
    if (locked.current) return;
    locked.current = true;
    setPendingId(id);
    try {
      await performCancellation(feed, id);
    } finally {
      locked.current = false;
      if (feed.context.lifecycle.active) setPendingId('');
    }
  };
  return { pendingId, cancel };
}
export function useMyBookings(accountId?: string) {
  const feed = useBookingFeed(accountId);
  const cancellation = useBookingCancellation(feed);
  return {
    bookings: feed.state.owner === accountId ? feed.state.records : [],
    error: feed.state.error,
    loading: feed.state.loading,
    reload: feed.reload,
    nextCursor: feed.state.cursor,
    ...cancellation,
  };
}
