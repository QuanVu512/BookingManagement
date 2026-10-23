import { paintLoginWave, type LoginWaveFrame } from './login-wave-drawing';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const MAX_PIXEL_RATIO = 2;
const PHASE_PER_MS = 0.0012;
const MAX_FRAME_GAP_MS = 64;
const OFFSCREEN_POINTER = { x: -1000, y: -1000 };

interface WaveState {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  media: MediaQueryList;
  paused: boolean;
  frame: LoginWaveFrame;
  requestId?: number;
  lastTime?: number;
}

function isRunning(state: WaveState) {
  return !state.paused && !state.media.matches && !document.hidden;
}

function stopLoop(state: WaveState) {
  if (state.requestId !== undefined)
    window.cancelAnimationFrame(state.requestId);
  state.requestId = undefined;
  state.lastTime = undefined;
}

function tick(state: WaveState, time: number) {
  if (!isRunning(state)) return;
  const elapsed =
    state.lastTime === undefined
      ? 0
      : Math.min(time - state.lastTime, MAX_FRAME_GAP_MS);
  state.frame.phase += elapsed * PHASE_PER_MS;
  state.lastTime = time;
  paintLoginWave(state.context, state.frame);
  state.requestId = window.requestAnimationFrame((nextTime) =>
    tick(state, nextTime),
  );
}

function syncLoop(state: WaveState) {
  stopLoop(state);
  paintLoginWave(state.context, state.frame);
  if (isRunning(state))
    state.requestId = window.requestAnimationFrame((time) => tick(state, time));
}

function resizeWave(state: WaveState) {
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  state.frame.width = window.innerWidth;
  state.frame.height = window.innerHeight;
  state.canvas.width = Math.round(state.frame.width * ratio);
  state.canvas.height = Math.round(state.frame.height * ratio);
  state.context.setTransform(ratio, 0, 0, ratio, 0, 0);
  syncLoop(state);
}

function listenToWave(state: WaveState) {
  const resize = () => resizeWave(state);
  const sync = () => syncLoop(state);
  const move = (event: PointerEvent) => {
    state.frame.pointer = { x: event.clientX, y: event.clientY };
  };
  const leave = () => {
    state.frame.pointer = OFFSCREEN_POINTER;
  };
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('blur', leave);
  document.documentElement.addEventListener('pointerleave', leave);
  document.addEventListener('visibilitychange', sync);
  state.media.addEventListener('change', sync);
  return () => {
    stopLoop(state);
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('blur', leave);
    document.documentElement.removeEventListener('pointerleave', leave);
    document.removeEventListener('visibilitychange', sync);
    state.media.removeEventListener('change', sync);
  };
}

export function attachLoginWave(
  canvas: HTMLCanvasElement,
  options: { paused: boolean },
) {
  if (
    typeof window.matchMedia !== 'function' ||
    typeof window.requestAnimationFrame !== 'function'
  )
    return;
  const context = canvas.getContext('2d');
  if (!context) return;
  const state: WaveState = {
    canvas,
    context,
    paused: options.paused,
    media: window.matchMedia(REDUCED_MOTION_QUERY),
    frame: { width: 0, height: 0, phase: 0, pointer: OFFSCREEN_POINTER },
  };
  const cleanup = listenToWave(state);
  resizeWave(state);
  return cleanup;
}
