'use client';
/** @deprecated Legacy static court-detail mockup. Not part of the live route; use frontend/features/courts instead. */

import { useValueFeedback } from './use-court-motion';

export function MotionValue({ value }: { value: string | number }) {
  const element = useValueFeedback(value);
  return (
    <span className="cb-motion-value" ref={element}>
      {value}
    </span>
  );
}
