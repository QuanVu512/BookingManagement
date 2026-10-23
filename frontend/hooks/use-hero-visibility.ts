'use client';

import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

export function useHeroVisibility(ref: RefObject<HTMLDivElement | null>) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === 'undefined') return;
    let inViewport = false;
    const update = () => setVisible(inViewport && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      inViewport = entry?.isIntersecting ?? false;
      update();
    });
    observer.observe(ref.current);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [ref]);
  return visible;
}
