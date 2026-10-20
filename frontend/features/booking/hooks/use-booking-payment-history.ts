'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getBookingPaymentOutcome,
  getBookingRefunds,
} from '../../payment/api/payment-service';
import {
  ApiRequestError,
  type RefundTrackerItem,
} from '../../payment/api/payment-contract';
import type { PaymentOutcome } from '../../payment/model/payment';

export type PaymentHistoryResource = 'PREPAYMENT' | 'BALANCE' | 'REFUNDS';
export type ResourceStatus = 'loading' | 'ready' | 'error';

export interface ResourceState<T> {
  status: ResourceStatus;
  data: T | null;
  error: string;
  retryAfterMs: number | null;
}

export interface PaymentHistoryResources {
  PREPAYMENT: ResourceState<PaymentOutcome>;
  BALANCE: ResourceState<PaymentOutcome>;
  REFUNDS: ResourceState<RefundTrackerItem[]>;
}

interface InternalResources {
  PREPAYMENT: ResourceState<unknown>;
  BALANCE: ResourceState<unknown>;
  REFUNDS: ResourceState<unknown>;
}

interface PaymentHistoryState {
  bookingId: string | null;
  resources: InternalResources;
  updatedAt: number | null;
  refreshing: boolean;
  cooldownUntil: number;
}

const RESOURCE_KEYS: PaymentHistoryResource[] = [
  'PREPAYMENT',
  'BALANCE',
  'REFUNDS',
];
const MAX_CONCURRENT = 2;
export const HISTORY_REFRESH_COOLDOWN_MS = 10_000;

function loadingState(preserved?: ResourceState<unknown>): ResourceState<unknown> {
  return {
    status: 'loading',
    data: preserved?.data ?? null,
    error: '',
    retryAfterMs: null,
  };
}

function emptyState(): PaymentHistoryState {
  return {
    bookingId: null,
    resources: {
      PREPAYMENT: loadingState(),
      BALANCE: loadingState(),
      REFUNDS: loadingState(),
    },
    updatedAt: null,
    refreshing: false,
    cooldownUntil: 0,
  };
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error && reason.message
    ? reason.message
    : 'Chưa tải được trạng thái.';
}

export function useBookingPaymentHistory(accountId?: string) {
  const [state, setState] = useState<PaymentHistoryState>(emptyState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const generation = useRef(0);
  const controllers = useRef(new Map<string, AbortController>());
  const inFlight = useRef(new Set<string>());
  const active = useRef(0);
  const queue = useRef<Array<() => void>>([]);

  const cancelAll = useCallback(() => {
    generation.current += 1;
    controllers.current.forEach((controller) => controller.abort());
    controllers.current.clear();
    inFlight.current.clear();
    queue.current = [];
  }, []);

  const update = useCallback(
    (
      bookingId: string,
      resource: PaymentHistoryResource,
      patch: (previous: ResourceState<unknown>) => ResourceState<unknown>,
    ) => {
      setState((previous) => {
        if (previous.bookingId !== bookingId) return previous;
        return {
          ...previous,
          resources: {
            ...previous.resources,
            [resource]: patch(previous.resources[resource]),
          },
        };
      });
    },
    [],
  );

  const runLimited = useCallback((task: () => Promise<void>) => {
    return new Promise<void>((resolve) => {
      const start = () => {
        active.current += 1;
        void task().finally(() => {
          active.current -= 1;
          resolve();
          queue.current.shift()?.();
        });
      };
      if (active.current < MAX_CONCURRENT) start();
      else queue.current.push(start);
    });
  }, []);

  const load = useCallback(
    (
      bookingId: string,
      resource: PaymentHistoryResource,
      requestGeneration: number,
      preserve: boolean,
    ) => {
      const key = `${bookingId}:${resource}`;
      if (inFlight.current.has(key)) return Promise.resolve();
      inFlight.current.add(key);
      const controller = new AbortController();
      controllers.current.set(key, controller);
      update(bookingId, resource, (previous) =>
        loadingState(preserve ? previous : undefined),
      );
      return runLimited(async () => {
        const cleanup = () => {
          inFlight.current.delete(key);
          controllers.current.delete(key);
        };
        if (requestGeneration !== generation.current) {
          cleanup();
          return;
        }
        try {
          const data =
            resource === 'REFUNDS'
              ? await getBookingRefunds(bookingId, controller.signal)
              : await getBookingPaymentOutcome(
                  bookingId,
                  resource,
                  controller.signal,
                );
          if (requestGeneration !== generation.current) return;
          update(bookingId, resource, () => ({
            status: 'ready',
            data,
            error: '',
            retryAfterMs: null,
          }));
          setState((previous) =>
            previous.bookingId === bookingId
              ? { ...previous, updatedAt: Date.now() }
              : previous,
          );
        } catch (reason: unknown) {
          if (
            controller.signal.aborted ||
            requestGeneration !== generation.current
          )
            return;
          update(bookingId, resource, (previous) => ({
            status: 'error',
            data: previous.data,
            error: errorMessage(reason),
            retryAfterMs:
              reason instanceof ApiRequestError ? reason.retryAfterMs : null,
          }));
        } finally {
          cleanup();
        }
      });
    },
    [runLimited, update],
  );

  const collapse = useCallback(() => {
    cancelAll();
    setState(emptyState());
  }, [cancelAll]);

  const toggle = useCallback(
    (bookingId: string) => {
      if (stateRef.current.bookingId === bookingId) {
        collapse();
        return;
      }
      cancelAll();
      const requestGeneration = generation.current;
      setState({
        ...emptyState(),
        bookingId,
        resources: {
          PREPAYMENT: loadingState(),
          BALANCE: loadingState(),
          REFUNDS: loadingState(),
        },
      });
      RESOURCE_KEYS.forEach((resource) => {
        void load(bookingId, resource, requestGeneration, false);
      });
    },
    [cancelAll, collapse, load],
  );

  const refresh = useCallback(() => {
    const current = stateRef.current;
    if (!current.bookingId || current.refreshing) return;
    if (Date.now() < current.cooldownUntil) return;
    if (
      RESOURCE_KEYS.some(
        (resource) => current.resources[resource].status === 'loading',
      )
    )
      return;
    const bookingId = current.bookingId;
    const requestGeneration = generation.current;
    setState((previous) => ({
      ...previous,
      refreshing: true,
      cooldownUntil: Date.now() + HISTORY_REFRESH_COOLDOWN_MS,
    }));
    void Promise.all(
      RESOURCE_KEYS.map((resource) =>
        load(bookingId, resource, requestGeneration, true),
      ),
    ).finally(() => {
      setState((previous) =>
        previous.bookingId === bookingId
          ? { ...previous, refreshing: false }
          : previous,
      );
    });
  }, [load]);

  const retry = useCallback(
    (resource: PaymentHistoryResource) => {
      const current = stateRef.current;
      if (!current.bookingId) return;
      if (current.resources[resource].status !== 'error') return;
      if (inFlight.current.has(`${current.bookingId}:${resource}`)) return;
      void load(current.bookingId, resource, generation.current, true);
    },
    [load],
  );

  useEffect(() => {
    cancelAll();
    setState(emptyState());
  }, [accountId, cancelAll]);

  useEffect(() => () => cancelAll(), [cancelAll]);

  useEffect(() => {
    if (!state.cooldownUntil) return;
    const remaining = state.cooldownUntil - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => {
      setState((previous) => ({ ...previous, cooldownUntil: 0 }));
    }, remaining);
    return () => clearTimeout(timer);
  }, [state.cooldownUntil]);

  return {
    bookingId: state.bookingId,
    resources: state.resources as unknown as PaymentHistoryResources,
    updatedAt: state.updatedAt,
    refreshing: state.refreshing,
    cooldownUntil: state.cooldownUntil,
    toggle,
    refresh,
    retry,
  };
}
