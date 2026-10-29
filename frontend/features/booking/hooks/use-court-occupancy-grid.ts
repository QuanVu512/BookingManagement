'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadCourtDayOccupancies } from '../api/booking-service';
import type { CourtDayOccupanciesData } from '../api/booking-contract';
import { BOOKING_REFRESH_MS } from '../model/booking-time';

export type OccupancyGridStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface OccupancyGridState {
  status: OccupancyGridStatus;
  data: CourtDayOccupanciesData | null;
  error: string;
  /** True while a background revalidate runs on top of existing data. */
  isStale: boolean;
  /** Consecutive background failures; locks new submits at threshold. */
  failures: number;
  lastUpdatedMs: number | null;
  refresh: () => void;
}

const STALE_FAILURE_THRESHOLD = 2;
const GRID_REQUEST_TIMEOUT_MS = 10_000;
const GRID_TIMEOUT_REASON = 'occupancy-timeout';

interface GridRequest {
  seq: number;
  courtId: string;
  date: string;
}

function errorMessage(): string {
  return 'Không tải được lịch sân. Vui lòng kiểm tra kết nối.';
}

/**
 * Day-grid occupancy feed.
 *
 * Review v2.1 fixes wired in:
 * - Focus/visibility ALWAYS revalidates (no >3s gate); the response still
 *   carries a fresh serverNow and expiry-filtered intervals.
 * - Initial load failure -> `error` (pickers lock safe); background failure
 *   keeps old data with a stale warning and locks new submits after
 *   STALE_FAILURE_THRESHOLD consecutive failures, while the idempotent
 *   "retry request" action stays available per BOOKING-MVP replay contract.
 * - Stale responses after court/date switches are dropped via seq + abort.
 */
export function useCourtOccupancyGrid(
  courtId: string,
  selectedDate: string,
  active: boolean,
): OccupancyGridState {
  const [status, setStatus] = useState<OccupancyGridStatus>('idle');
  const [data, setData] = useState<CourtDayOccupanciesData | null>(null);
  const [error, setError] = useState('');
  const [isStale, setIsStale] = useState(false);
  const [failures, setFailures] = useState(0);
  const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(null);
  const requestRef = useRef<GridRequest>({ seq: 0, courtId: '', date: '' });
  const hasDataRef = useRef(false);
  const mountedRef = useRef(true);
  const inFlightRef = useRef<AbortController | null>(null);
  const stateRef = useRef({ courtId, selectedDate, active });
  stateRef.current = { courtId, selectedDate, active };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      inFlightRef.current?.abort('unmount');
      inFlightRef.current = null;
    };
  }, []);

  const fetchGrid = useCallback(
    async (reason: 'initial' | 'poll' | 'focus' | 'manual') => {
      const current = stateRef.current;
      if (!current.active || !current.courtId || !current.selectedDate) return;
      // Monotonic sequence: never reset on court/date switches, so a late
      // response from the previous day can never share the current seq.
      // The previous in-flight request is aborted outright (superseded).
      inFlightRef.current?.abort('superseded');
      const seq = requestRef.current.seq + 1;
      const identity: GridRequest = {
        seq,
        courtId: current.courtId,
        date: current.selectedDate,
      };
      requestRef.current = identity;
      const controller = new AbortController();
      inFlightRef.current = controller;
      const timeout = setTimeout(
        () => controller.abort(GRID_TIMEOUT_REASON),
        GRID_REQUEST_TIMEOUT_MS,
      );
      const isBackground = reason !== 'initial' && hasDataRef.current;
      if (!isBackground) {
        setStatus('loading');
        setError('');
      } else {
        setIsStale(true);
      }
      const isCurrent = (): boolean =>
        requestRef.current.seq === seq &&
        requestRef.current.courtId === identity.courtId &&
        requestRef.current.date === identity.date;
      try {
        const snapshot: CourtDayOccupanciesData = await loadCourtDayOccupancies(
          current.courtId,
          current.selectedDate,
          controller.signal,
        );
        if (!isCurrent() || !mountedRef.current) return;
        hasDataRef.current = true;
        setData(snapshot);
        setError('');
        setFailures(0);
        setLastUpdatedMs(Date.now());
        setStatus('ready');
      } catch {
        if (!isCurrent() || !mountedRef.current) return;
        if (controller.signal.aborted) {
          // Superseded/unmount aborts are intentional: stay silent. A
          // timeout abort is a real failure: surface it so the grid never
          // sticks in `loading` or serves stale data without counting it.
          if (controller.signal.reason !== GRID_TIMEOUT_REASON) return;
        }
        if (!hasDataRef.current) {
          setStatus('error');
          setError(errorMessage());
        } else {
          setFailures((count) => count + 1);
        }
      } finally {
        clearTimeout(timeout);
        if (inFlightRef.current === controller) inFlightRef.current = null;
        if (isCurrent() && mountedRef.current) setIsStale(false);
      }
    },
    [],
  );

  const refresh = useCallback(() => {
    void fetchGrid('manual');
  }, [fetchGrid]);

  useEffect(() => {
    // Abort the previous day's request before starting the new one; the
    // sequence stays monotonic so a late old response can never win.
    inFlightRef.current?.abort('superseded');
    inFlightRef.current = null;
    hasDataRef.current = false;
    setData(null);
    setError('');
    setFailures(0);
    setLastUpdatedMs(null);
    setStatus(courtId && selectedDate ? 'loading' : 'idle');
    if (!courtId || !selectedDate || !active) return;
    void fetchGrid('initial');
  }, [courtId, selectedDate, active, fetchGrid]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      void fetchGrid('poll');
    }, BOOKING_REFRESH_MS);
    const onVisible = () => {
      // Always revalidate on focus/visibility: the 3s gate is removed so a
      // hold created just before blur is visible within ~1s of return.
      if (document.visibilityState === 'visible') void fetchGrid('focus');
    };
    const onFocus = () => {
      void fetchGrid('focus');
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [active, fetchGrid]);

  return {
    status,
    data,
    error,
    isStale,
    failures,
    lastUpdatedMs,
    refresh,
  };
}

export const OCCUPANCY_STALE_FAILURE_THRESHOLD = STALE_FAILURE_THRESHOLD;
