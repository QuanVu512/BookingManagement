const ICON_PATHS = {
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7Z',
  lock: 'M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2Zm2-10V7a4 4 0 0 1 8 0v4H8Z',
  back: 'M10 19l-7-7 7-7M3 12h18',
  arrow: 'm13 7 5 5-5 5m5-5H6',
  eye: 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM2.5 12C3.7 8 7.5 5 12 5s8.3 3 9.5 7c-1.2 4-5 7-9.5 7s-8.3-3-9.5-7Z',
  court: 'M5 4h14v16H5V4Zm0 8h14M12 4v16M5 8h14M5 16h14',
};

export function LoginIcon({ name }: { name: keyof typeof ICON_PATHS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
