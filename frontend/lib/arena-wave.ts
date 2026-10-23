import {
  ARENA_WAVE,
  drawArenaWave,
  type ArenaWaveFrame,
} from './arena-wave-drawing';

function waveCanvas(canvas: HTMLCanvasElement) {
  if (typeof window.requestAnimationFrame !== 'function') return null;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const resize = () => {
    const density = Math.min(window.devicePixelRatio || 1, ARENA_WAVE.maxDpr);
    canvas.width = window.innerWidth * density;
    canvas.height = ARENA_WAVE.height * density;
    context.setTransform(density, 0, 0, density, 0, 0);
  };
  resize();
  return { context, resize, canvas };
}

type WaveSurface = NonNullable<ReturnType<typeof waveCanvas>>;

function initialFrame(): ArenaWaveFrame {
  return {
    width: window.innerWidth,
    phase: 0,
    pointer: { x: -1000, y: -1000 },
  };
}

function wavePlayback(surface: WaveSurface, frame: ArenaWaveFrame) {
  let animation = 0;
  let previousTime = 0;
  const render = (timestamp: number) => {
    const delta = previousTime
      ? Math.min(timestamp - previousTime, ARENA_WAVE.maxDeltaMs)
      : 0;
    previousTime = timestamp;
    frame.phase += delta * ARENA_WAVE.phasePerMs;
    drawArenaWave(surface.context, frame);
    animation = window.requestAnimationFrame(render);
  };
  return {
    stop: () => {
      window.cancelAnimationFrame(animation);
      previousTime = 0;
    },
    paint: () => drawArenaWave(surface.context, frame),
    play: () => {
      animation = window.requestAnimationFrame(render);
    },
  };
}

function pointerListeners(surface: WaveSurface, frame: ArenaWaveFrame) {
  let bounds = surface.canvas.getBoundingClientRect();
  const updateBounds = () => {
    bounds = surface.canvas.getBoundingClientRect();
  };
  const pointer = (event: PointerEvent) => {
    frame.pointer = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
  };
  const leave = () => {
    frame.pointer = { x: -1000, y: -1000 };
  };
  window.addEventListener('pointermove', pointer, { passive: true });
  window.addEventListener('resize', updateBounds, { passive: true });
  window.addEventListener('blur', leave);
  document.documentElement.addEventListener('pointerleave', leave);
  return {
    release: () => {
      window.removeEventListener('pointermove', pointer);
      window.removeEventListener('resize', updateBounds);
      window.removeEventListener('blur', leave);
      document.documentElement.removeEventListener('pointerleave', leave);
    },
    updateBounds,
  };
}

export function attachArenaWave(
  canvas: HTMLCanvasElement,
  options: { paused: boolean },
) {
  const surface = waveCanvas(canvas);
  if (!surface) return;
  const frame = initialFrame();
  const playback = wavePlayback(surface, frame);
  const synchronize = () => {
    playback.stop();
    playback.paint();
    if (!options.paused && !document.hidden) playback.play();
  };
  const pointerController = pointerListeners(surface, frame);
  const resize = () => {
    surface.resize();
    frame.width = window.innerWidth;
    pointerController.updateBounds();
    synchronize();
  };
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', synchronize);
  synchronize();
  return () => {
    playback.stop();
    pointerController.release();
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', synchronize);
  };
}
