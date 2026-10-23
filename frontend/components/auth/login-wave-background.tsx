'use client';

import { useEffect, useRef } from 'react';
import { attachLoginWave } from '../../lib/login-wave';
import styles from './login-page.module.css';

export function LoginWaveBackground({ paused }: { paused: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvas.current) return attachLoginWave(canvas.current, { paused });
  }, [paused]);
  return <canvas className={styles.wave} ref={canvas} aria-hidden="true" />;
}
