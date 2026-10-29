'use client';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useAuthActions, useAuthSession } from '../../../context/auth-context';
import { useLiveBooking, useServiceCatalog } from '../hooks/use-live-booking';
import { CourtServices } from '../../courts/components/court-services';
import { LiveBookingView } from './live-booking-view';
import { BookingSchedulePicker } from './booking-schedule-picker';
import {
  BookingOrderSummary,
  calculateEstimatedPrices,
} from './booking-order-summary';
import { BookingDayStrip } from './booking-day-strip';
import { isoToLocalInput, isWindowInPast } from '../model/booking-time';
import {
  useCourtOccupancyGrid,
  OCCUPANCY_STALE_FAILURE_THRESHOLD,
} from '../hooks/use-court-occupancy-grid';
import { isWindowConflict } from '../model/booking-occupancy';

function useBookingController(
  courtId: string,
  timezone: string,
  prepaymentPercent: 30 | 100 = 30,
) {
  const session = useAuthSession();
  const { openSignIn, refreshSession } = useAuthActions();
  const state = useLiveBooking(
    courtId,
    timezone,
    session.isAuthenticated ? session.user?.id : undefined,
    prepaymentPercent,
  );
  const signInLabel =
    session.status === 'unknown'
      ? 'Kiểm tra lại phiên đăng nhập'
      : 'Đăng nhập để giữ sân';
  const signIn = () =>
    session.status === 'unknown' ? void refreshSession() : openSignIn();
  return {
    state,
    timezone,
    authenticated: session.isAuthenticated,
    showSignIn: !session.isLoading && !session.isAuthenticated,
    signInLabel,
    onChangeWindow: state.changeWindow,
    onQuote: state.quoteAvailability,
    onCreate: state.createHold,
    onSignIn: signIn,
    onChangeService: state.changeService,
  };
}

export function LiveBookingPanel({
  courtId,
  timezone,
  prepaymentPercent = 30,
  detail,
  preselectedWindow,
  onGuestBook,
}: {
  courtId: string;
  timezone: string;
  prepaymentPercent?: 30 | 100;
  detail?: {
    name: string;
    code: string;
    pricePerHour?: number;
    overview: ReactNode;
  };
  preselectedWindow?: { startsAt: string; endsAt: string };
  onGuestBook?: (params: {
    courtId: string;
    courtName?: string;
    courtCode?: string;
    window: { start: string; end: string };
    totalAmount?: number;
    prepaymentAmount?: number;
  }) => void;
}) {
  const props = useBookingController(courtId, timezone, prepaymentPercent);
  const selectedDate = props.state.window.start.slice(0, 10);
  const occupancy = useCourtOccupancyGrid(courtId, selectedDate, true);
  // Window-level conflict (whole [start, end + cleanup) range). Self-hold
  // protection: while this session owns a hold, its own window never counts
  // as someone else's conflict, so refreshes never wipe the QR modal.
  const gridConflict = useMemo(() => {
    if (props.state.booking || !occupancy.data) return false;
    return isWindowConflict(
      props.state.window,
      occupancy.data.timezone,
      occupancy.data.cleanupMinutes,
      occupancy.data.occupiedIntervals,
    );
  }, [props.state.booking, props.state.window, occupancy.data]);
  // Initial load error, in-flight/freshness gap, or repeated background
  // failures lock NEW submits; the idempotent retry action stays available
  // per replay contract. A missing or mismatched snapshot also locks: the
  // grid must be verified for the current court/date before submitting.
  const hasFreshGrid =
    occupancy.status === 'ready' &&
    occupancy.data !== null &&
    occupancy.data.courtId === courtId &&
    occupancy.data.date === selectedDate;
  const gridLocked =
    occupancy.status === 'error' ||
    occupancy.status === 'loading' ||
    occupancy.status === 'idle' ||
    !hasFreshGrid ||
    occupancy.failures >= OCCUPANCY_STALE_FAILURE_THRESHOLD;
  const gridProps = useMemo(
    () => ({ courtId, occupancy, gridConflict, gridLocked }),
    [courtId, occupancy, gridConflict, gridLocked],
  );
  const createWithRefresh = useMemo(
    () => () => {
      void Promise.resolve(props.onCreate()).finally(() => occupancy.refresh());
    },
    [props.onCreate, occupancy],
  );
  const propsWithGrid = useMemo(
    () => ({ ...props, ...gridProps, onCreate: createWithRefresh }),
    [props, gridProps, createWithRefresh],
  );
  const preselectedLocal = useMemo(() => {
    if (!preselectedWindow) {
      return null;
    }
    try {
      return {
        start: isoToLocalInput(preselectedWindow.startsAt, timezone),
        end: isoToLocalInput(preselectedWindow.endsAt, timezone),
      };
    } catch {
      return null;
    }
  }, [preselectedWindow, timezone]);
  const appliedPreselect = useRef(false);
  const quotedPreselect = useRef(false);
  useEffect(() => {
    if (appliedPreselect.current || !preselectedLocal) {
      return;
    }
    appliedPreselect.current = true;
    props.onChangeWindow(preselectedLocal);
  }, [preselectedLocal, props]);
  useEffect(() => {
    if (
      quotedPreselect.current ||
      !preselectedLocal ||
      props.state.window.start !== preselectedLocal.start ||
      props.state.window.end !== preselectedLocal.end
    ) {
      return;
    }
    quotedPreselect.current = true;
    void props.onQuote();
  }, [preselectedLocal, props]);

  // Tự động tính giá và kiểm tra lịch ngay khi khung giờ thay đổi hợp lệ (không cần ấn nút)
  const lastQuotedKey = useRef<string>('');
  useEffect(() => {
    const { start, end } = props.state.window;
    if (!start || !end) return;
    const startTime = start.slice(11);
    const endTime = end.slice(11);
    if (!startTime || !endTime) return;
    if (startTime >= endTime) return;

    if (isWindowInPast(props.state.window, timezone)) {
      return;
    }

    const currentKey = `${start}:${end}:${courtId}:${prepaymentPercent}`;
    if (lastQuotedKey.current === currentKey) return;

    const timer = setTimeout(() => {
      lastQuotedKey.current = currentKey;
      void props.onQuote();
    }, 120);

    return () => clearTimeout(timer);
  }, [
    props.state.window.start,
    props.state.window.end,
    courtId,
    timezone,
    prepaymentPercent,
    props.onQuote,
  ]);

  const catalog = useServiceCatalog(courtId, props.state.window, timezone);
  if (!detail) return <LiveBookingView {...propsWithGrid} />;
  return (
    <div className="court-detail-grid">
      <BookingDayStrip {...propsWithGrid} />
      <div className="court-detail-main">
        {detail.overview}
        <BookingSchedulePicker {...propsWithGrid} />
        <CourtServices
          products={catalog.products}
          loading={catalog.loading}
          error={catalog.error}
          onRetry={catalog.retry}
          selection={props.state.services ?? []}
          disabled={props.state.busy || Boolean(props.state.booking)}
          onChange={props.onChangeService}
        />
      </div>
      <BookingOrderSummary
        {...propsWithGrid}
        courtName={detail.name}
        courtCode={detail.code}
        products={catalog.products}
        pricePerHour={detail.pricePerHour}
        onGuestBook={
          onGuestBook
            ? () => {
                const estimated = calculateEstimatedPrices({
                  start: props.state.window.start,
                  end: props.state.window.end,
                  pricePerHour: detail.pricePerHour,
                  services: props.state.services,
                  products: catalog.products,
                });
                const total = props.state.quote?.available
                  ? props.state.quote.totalAmount
                  : estimated?.total;
                const prepayment =
                  total !== undefined
                    ? Math.floor((total * 30 + 50) / 100)
                    : undefined;
                onGuestBook({
                  courtId,
                  courtName: detail.name,
                  courtCode: detail.code,
                  window: props.state.window,
                  totalAmount: total,
                  prepaymentAmount: prepayment,
                });
              }
            : undefined
        }
      />
    </div>
  );
}
