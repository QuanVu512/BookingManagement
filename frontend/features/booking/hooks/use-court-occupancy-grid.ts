'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadCourtDayOccupancies } from '../api/booking-service';
import type { CourtDayOccupanciesData } from '../api/booking-contract';
import {
  BOOKING_REFRESH_MS,
  OCCUPANCY_FOCUS_THROTTLE_MS,
  OCCUPANCY_IDLE_TIMEOUT_MS,
} from '../model/booking-time';

export type OccupancyGridStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface OccupancyGridState {
  status: OccupancyGridStatus;
  data: CourtDayOccupanciesData | null;
  error: string;
  /** True while a background revalidate runs on top of existing data. */
  isStale: boolean;
  /** True when polling paused after prolonged user inactivity. */
  isIdlePaused: boolean;
  /** Consecutive background failures; locks new submits at threshold. */
  failures: number;
  lastUpdatedMs: number | null;
  refresh: () => void;
}

const STALE_FAILURE_THRESHOLD = 2;
const GRID_REQUEST_TIMEOUT_MS = 10_000;
const GRID_TIMEOUT_REASON = 'occupancy-timeout';
const USER_ACTIVITY_EVENTS = [
  'pointerdown',
  'mousemove',
  'keydown',
  'wheel',
  'touchstart',
] as const;

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
 * Optimizations wired in:
 * - Polling interval set to BOOKING_REFRESH_MS (60s) and paused when tab is
 *   hidden or after OCCUPANCY_IDLE_TIMEOUT_MS (3 minutes) of no interaction.
 * - Focus/visibility revalidation throttled by OCCUPANCY_FOCUS_THROTTLE_MS (10s)
 *   after the latest successful fetch to prevent DevTools/tab-switch request spam.
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
  const [isIdlePaused, setIsIdlePaused] = useState(false);
  const [failures, setFailures] = useState(0);
  const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(null);
  const requestRef = useRef<GridRequest>({ seq: 0, courtId: '', date: '' });
  const hasDataRef = useRef(false);
  const lastSuccessAtRef = useRef<number | null>(null);
  const lastActivityAtRef = useRef<number>(Date.now());
  const idlePausedRef = useRef(false);
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
      if (reason === 'poll') {
        if (
          typeof document !== 'undefined' &&
          document.visibilityState === 'hidden'
        ) {
          return;
        }
        if (idlePausedRef.current) return;
      }
      if (reason === 'focus') {
        if (
          hasDataRef.current &&
          lastSuccessAtRef.current !== null &&
          Date.now() - lastSuccessAtRef.current < OCCUPANCY_FOCUS_THROTTLE_MS
        ) {
          return;
        }
      }
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
        const completedAt = Date.now();
        hasDataRef.current = true;
        lastSuccessAtRef.current = completedAt;
        setData(snapshot);
        setError('');
        setFailures(0);
        setLastUpdatedMs(completedAt);
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
    lastActivityAtRef.current = Date.now();
    idlePausedRef.current = false;
    setIsIdlePaused(false);
    void fetchGrid('manual');
  }, [fetchGrid]);

  useEffect(() => {
    // Abort the previous day's request before starting the new one; the
    // sequence stays monotonic so a late old response can never win.
    inFlightRef.current?.abort('superseded');
    inFlightRef.current = null;
    hasDataRef.current = false;
    lastSuccessAtRef.current = null;
    lastActivityAtRef.current = Date.now();
    idlePausedRef.current = false;
    setIsIdlePaused(false);
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
    const recordActivity = () => {
      lastActivityAtRef.current = Date.now();
    };
    const timer = setInterval(() => {
      if (
        !idlePausedRef.current &&
        Date.now() - lastActivityAtRef.current >= OCCUPANCY_IDLE_TIMEOUT_MS
      ) {
        idlePausedRef.current = true;
        setIsIdlePaused(true);
        return;
      }
      void fetchGrid('poll');
    }, BOOKING_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        lastActivityAtRef.current = Date.now();
        if (!idlePausedRef.current) void fetchGrid('focus');
      }
    };
    const onFocus = () => {
      lastActivityAtRef.current = Date.now();
      if (!idlePausedRef.current) void fetchGrid('focus');
    };
    const onHoldReleased = () => {
      lastActivityAtRef.current = Date.now();
      idlePausedRef.current = false;
      setIsIdlePaused(false);
      void fetchGrid('manual');
    };
    for (const eventName of USER_ACTIVITY_EVENTS) {
      window.addEventListener(eventName, recordActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('booking-hold-released', onHoldReleased);
    return () => {
      clearInterval(timer);
      for (const eventName of USER_ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, recordActivity);
      }
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('booking-hold-released', onHoldReleased);
    };
  }, [active, fetchGrid]);

  return {
    status,
    data,
    error,
    isStale,
    isIdlePaused,
    failures,
    lastUpdatedMs,
    refresh,
  };
}

export const OCCUPANCY_STALE_FAILURE_THRESHOLD = STALE_FAILURE_THRESHOLD;
