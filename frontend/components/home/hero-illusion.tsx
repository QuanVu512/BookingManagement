'use client';

import { useId, useRef, useState } from 'react';
import { useHeroVisibility } from '../../hooks/use-hero-visibility';

const RIBBON_PATH =
  'M-150 280 C80 20 250 360 470 180 S760 280 970 110 S1260 350 1590 160';

function IllusionRibbon({ patternId }: { patternId: string }) {
  return (
    <svg
      className="hero-illusion-art"
      viewBox="0 0 1440 620"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern
          id={patternId}
          width="12"
          height="620"
          patternUnits="userSpaceOnUse"
        >
          <rect x="2" width="3" height="620" fill="currentColor" />
        </pattern>
      </defs>
      <g fill="none" stroke={`url(#${patternId})`} strokeWidth="145">
        <path className="hero-ribbon hero-ribbon-primary" d={RIBBON_PATH} />
        <path className="hero-ribbon hero-ribbon-secondary" d={RIBBON_PATH} />
      </g>
    </svg>
  );
}

export function HeroIllusion() {
  const ref = useRef<HTMLDivElement>(null);
  const patternId = useId();
  const [paused, setPaused] = useState(false);
  const visible = useHeroVisibility(ref);
  return (
    <div className="hero-illusion" ref={ref} data-running={visible && !paused}>
      <IllusionRibbon patternId={patternId} />
      <button
        type="button"
        className="hero-motion-toggle"
        aria-pressed={paused}
        onClick={() => setPaused(!paused)}
      >
        {paused ? 'Bật hiệu ứng' : 'Tạm dừng hiệu ứng'}
      </button>
    </div>
  );
}
