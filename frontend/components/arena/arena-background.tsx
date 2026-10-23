'use client';

import { useEffect, useRef } from 'react';
import { attachArenaWave } from '../../lib/arena-wave';

export function ArenaBackground({ paused }: { paused: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvas.current) return attachArenaWave(canvas.current, { paused });
  }, [paused]);
  return (
    <div className="arena-background" aria-hidden="true">
      <canvas ref={canvas} className="arena-wave" />
      <div className="arena-tech-grid" />
      <div className="arena-ambient" />
    </div>
  );
}
