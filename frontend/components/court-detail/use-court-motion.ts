'use client';
/** @deprecated Legacy static court-detail mockup. Not part of the live route; use frontend/features/courts instead. */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useSyncExternalStore,
} from 'react';
import {
  COURT_MOTION,
  getValueFeedbackFrames,
  handleMotionCancellation,
} from '../../lib/court-motion';

const useAnimationEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;
const getServerMotion = () => true;
const getMotionPreference = () =>
  window.matchMedia(COURT_MOTION.mediaQuery).matches;

function subscribeMotionPreference(onChange: () => void) {
  const query = window.matchMedia(COURT_MOTION.mediaQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function useReducedCourtMotion() {
  return useSyncExternalStore(
    subscribeMotionPreference,
    getMotionPreference,
    getServerMotion,
  );
}

export function useValueFeedback(value: string | number) {
  const element = useRef<HTMLSpanElement>(null);
  const previousValue = useRef(value);
  const isReduced = useReducedCourtMotion();
  useAnimationEffect(() => {
    if (previousValue.current === value) return;
    previousValue.current = value;
    if (!element.current?.animate) return;
    const animation = element.current.animate(
      getValueFeedbackFrames(isReduced),
      {
        duration: isReduced
          ? COURT_MOTION.reducedFeedbackDuration
          : COURT_MOTION.feedbackDuration,
        easing: COURT_MOTION.easing,
      },
    );
    animation.finished.catch(handleMotionCancellation);
    return () => animation.cancel();
  }, [value, isReduced]);
  return element;
}

interface GalleryState {
  count: number;
  requested: number;
  displayed: number;
  previous: number | null;
  error: string;
}

type GalleryAction =
  | { type: 'select'; index: number }
  | { type: 'move'; delta: number }
  | { type: 'ready' | 'failed' | 'settled'; index: number };

function createGalleryState(count: number): GalleryState {
  return { count, requested: 0, displayed: 0, previous: null, error: '' };
}

function requestGalleryImage(state: GalleryState, index: number): GalleryState {
  const requested = (index + state.count) % state.count;
  // A retained previous layer is already decoded, so reversing during a fade needs no new load event.
  return requested === state.previous
    ? {
        ...state,
        requested,
        displayed: requested,
        previous: state.displayed,
        error: '',
      }
    : { ...state, requested, error: '' };
}

function reduceGallery(
  state: GalleryState,
  action: GalleryAction,
): GalleryState {
  switch (action.type) {
    case 'select':
      return requestGalleryImage(state, action.index);
    case 'move':
      return requestGalleryImage(state, state.requested + action.delta);
    case 'ready':
      return displayReadyImage(state, action.index);
    case 'settled':
      return action.index === state.displayed
        ? { ...state, previous: null }
        : state;
    case 'failed':
      return retainImageAfterFailure(state, action.index);
  }
}

function displayReadyImage(state: GalleryState, index: number): GalleryState {
  if (index !== state.requested || index === state.displayed) return state;
  return { ...state, displayed: index, previous: state.displayed, error: '' };
}

function retainImageAfterFailure(
  state: GalleryState,
  index: number,
): GalleryState {
  return index === state.requested
    ? {
        ...state,
        requested: state.displayed,
        error: 'Ảnh chưa tải được. Hãy thử chọn góc khác.',
      }
    : state;
}

function useGalleryCrossfade(
  state: GalleryState,
  onSettled: (index: number) => void,
) {
  const element = useRef<HTMLImageElement>(null);
  const isReduced = useReducedCourtMotion();
  useAnimationEffect(() => {
    if (state.previous === null) return;
    if (isReduced || !element.current?.animate) {
      onSettled(state.displayed);
      return;
    }
    const animation = element.current.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      {
        duration: COURT_MOTION.galleryDuration,
        easing: COURT_MOTION.easing,
      },
    );
    animation.finished
      .then(() => onSettled(state.displayed))
      .catch(handleMotionCancellation);
    return () => animation.cancel();
  }, [state.displayed, state.previous, isReduced, onSettled]);
  return element;
}

export function useGalleryMotion(count: number) {
  const [state, dispatch] = useReducer(
    reduceGallery,
    count,
    createGalleryState,
  );
  const onSettled = useCallback(
    (index: number) => dispatch({ type: 'settled', index }),
    [dispatch],
  );
  const imageRef = useGalleryCrossfade(state, onSettled);
  return {
    state,
    imageRef,
    onSelect: (index: number) => dispatch({ type: 'select', index }),
    onMove: (delta: number) => dispatch({ type: 'move', delta }),
    onReady: (index: number) => dispatch({ type: 'ready', index }),
    onError: (index: number) => dispatch({ type: 'failed', index }),
  };
}

export type GalleryMotion = ReturnType<typeof useGalleryMotion>;
