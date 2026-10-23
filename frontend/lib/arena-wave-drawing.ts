export const ARENA_WAVE = {
  height: 500,
  centerY: 185,
  barWidth: 3.2,
  spacing: 6.5,
  pointerRadius: 180,
  pointerBoost: 50,
  maxHeight: 250,
  phasePerMs: 0.022 / (1000 / 60),
  maxDeltaMs: 50,
  maxDpr: 2,
};

export interface ArenaWaveFrame {
  width: number;
  phase: number;
  pointer: { x: number; y: number };
}

function barHeight(x: number, frame: ArenaWaveFrame) {
  const position = x / frame.width;
  const waveA = Math.sin(position * 4.2 + frame.phase * 0.9) * 55;
  const waveB = Math.cos(position * 8.5 - frame.phase * 0.6) * 30;
  const waveC = Math.sin(position * 1.8 + frame.phase * 0.4) * 40;
  const distance = Math.hypot(
    x - frame.pointer.x,
    ARENA_WAVE.centerY - frame.pointer.y,
  );
  const influence = Math.max(0, 1 - distance / ARENA_WAVE.pointerRadius);
  return Math.min(
    Math.abs(waveA + waveB + waveC) + 20 + influence * ARENA_WAVE.pointerBoost,
    ARENA_WAVE.maxHeight,
  );
}

function paintBar(
  context: CanvasRenderingContext2D,
  x: number,
  height: number,
) {
  const top = ARENA_WAVE.centerY - height / 2;
  const bottom = ARENA_WAVE.centerY + height / 2;
  const gradient = context.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, 'rgba(16,231,96,0)');
  gradient.addColorStop(0.3, 'rgba(52,211,153,.45)');
  gradient.addColorStop(0.5, 'rgba(16,231,96,.85)');
  gradient.addColorStop(0.7, 'rgba(16,185,129,.45)');
  gradient.addColorStop(1, 'rgba(5,150,105,0)');
  context.beginPath();
  context.lineWidth = ARENA_WAVE.barWidth;
  context.lineCap = 'round';
  context.strokeStyle = gradient;
  context.moveTo(x, top);
  context.lineTo(x, bottom);
  context.stroke();
}

export function drawArenaWave(
  context: CanvasRenderingContext2D,
  frame: ArenaWaveFrame,
) {
  context.clearRect(0, 0, frame.width, ARENA_WAVE.height);
  const unit = ARENA_WAVE.barWidth + ARENA_WAVE.spacing;
  const count = Math.ceil(frame.width / unit) + 2;
  for (let index = 0; index < count; index++) {
    const x = index * unit;
    paintBar(context, x, barHeight(x, frame));
  }
}
