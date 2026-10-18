export const COURT_MOTION = {
  mediaQuery: '(prefers-reduced-motion: reduce)',
  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
  galleryDuration: 260,
  feedbackDuration: 180,
  reducedFeedbackDuration: 90,
};

export function getValueFeedbackFrames(isReduced: boolean): Keyframe[] {
  const highlight = { backgroundColor: 'rgba(187, 242, 70, 0.35)' };
  const resting = { backgroundColor: 'rgba(187, 242, 70, 0)' };
  return isReduced
    ? [highlight, resting]
    : [
        { ...highlight, transform: 'translateY(2px)', opacity: 0.8 },
        { ...resting, transform: 'translateY(0)', opacity: 1 },
      ];
}

export function handleMotionCancellation(error: unknown): void {
  if (error instanceof DOMException && error.name === 'AbortError') return;
  console.info(
    'Chuyển động đã dừng.',
    error instanceof Error ? error.message : 'Không thể hoàn tất chuyển động.',
  );
}
