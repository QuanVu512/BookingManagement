export interface LoginWaveFrame {
  width: number;
  height: number;
  phase: number;
  pointer: { x: number; y: number };
}

const WAVE = {
  barWidth: 3,
  spacing: 6,
  centerRatio: 0.22,
  minimumHeight: 25,
  maximumHeightRatio: 0.45,
  pointerRadius: 220,
  pointerStrength: 45,
  secondarySpacing: 1.5,
  secondaryWidth: 1.5,
  secondaryOffset: 30,
  secondaryMinimum: 15,
};
const WAVES = [
  { frequency: 4, speed: 0.8, amplitude: 65, offset: 0 },
  { frequency: 8, speed: -0.5, amplitude: 35, offset: Math.PI / 2 },
  { frequency: 2.2, speed: 0.3, amplitude: 50, offset: 0 },
];
const COLOR_STOPS: [number, string][] = [
  [0, 'rgba(16,231,96,0)'],
  [0.3, 'rgba(52,211,153,.5)'],
  [0.5, 'rgba(16,231,96,.75)'],
  [0.7, 'rgba(16,185,129,.5)'],
  [1, 'rgba(5,150,105,0)'],
];

function barHeight(x: number, frame: LoginWaveFrame) {
  const wave = WAVES.reduce(
    (sum, item) =>
      sum +
      Math.sin(
        (x / frame.width) * item.frequency +
          frame.phase * item.speed +
          item.offset,
      ) *
        item.amplitude,
    0,
  );
  const distance = Math.hypot(
    x - frame.pointer.x,
    frame.height * WAVE.centerRatio - frame.pointer.y,
  );
  const interaction =
    Math.max(0, 1 - distance / WAVE.pointerRadius) * WAVE.pointerStrength;
  return Math.min(
    Math.abs(wave) + WAVE.minimumHeight + interaction,
    frame.height * WAVE.maximumHeightRatio,
  );
}

function primaryBars(context: CanvasRenderingContext2D, frame: LoginWaveFrame) {
  const step = WAVE.barWidth + WAVE.spacing;
  const center = frame.height * WAVE.centerRatio;
  context.lineWidth = WAVE.barWidth;
  for (let x = 0; x <= frame.width + step; x += step) {
    const height = barHeight(x, frame);
    const top = center - height / 2;
    const bottom = center + height / 2;
    const gradient = context.createLinearGradient(0, top, 0, bottom);
    for (const [offset, color] of COLOR_STOPS)
      gradient.addColorStop(offset, color);
    context.strokeStyle = gradient;
    context.beginPath();
    context.moveTo(x, top);
    context.lineTo(x, bottom);
    context.stroke();
  }
}

function secondaryBars(
  context: CanvasRenderingContext2D,
  frame: LoginWaveFrame,
) {
  const step = (WAVE.barWidth + WAVE.spacing) * WAVE.secondarySpacing;
  const center = frame.height * WAVE.centerRatio + WAVE.secondaryOffset;
  context.lineWidth = WAVE.secondaryWidth;
  context.strokeStyle = 'rgba(16,185,129,.2)';
  for (let x = 0; x <= frame.width; x += step) {
    const height =
      Math.abs(Math.sin((x / frame.width) * 3.5 - frame.phase * 0.6) * 45) +
      WAVE.secondaryMinimum;
    context.beginPath();
    context.moveTo(x, center - height / 2);
    context.lineTo(x, center + height / 2);
    context.stroke();
  }
}

export function paintLoginWave(
  context: CanvasRenderingContext2D,
  frame: LoginWaveFrame,
) {
  if (frame.width <= 0 || frame.height <= 0) return;
  context.clearRect(0, 0, frame.width, frame.height);
  context.lineCap = 'round';
  primaryBars(context, frame);
  secondaryBars(context, frame);
}
