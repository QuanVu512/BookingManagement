import type { SVGProps } from 'react';

const PATHS = {
  zap: 'm13 2-3 8H4l7 12 3-9h6Z',
  home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  calendar:
    'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2ZM8 14h3m-3 4h6',
  ticket: 'M3 7h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4Zm12 0v2m0 3v2m0 3v2',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM9 10a3 3 0 1 0 6 0 3 3 0 0 0-6 0',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'm6 6 12 12M6 18 18 6',
  layers: 'm12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0',
  check: 'm5 12 4 4L19 6',
  receipt: 'M4 3h16v18l-4-2-4 2-4-2-4 2Zm4 5h8m-8 4h8',
  qr: 'M3 3h6v6H3Zm12 0h6v6h-6ZM3 15h6v6H3Zm12 0h2v2h4v4h-4v-2h-2Zm4-3h2m-9 0v3',
  info: 'M12 11v6m0-10h.01M2 12a10 10 0 1 0 20 0 10 10 0 0 0-20 0',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  droplet: 'M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z',
  coffee:
    'M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8ZM6 1v3M10 1v3M14 1v3',
  car: 'M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C2.1 11 2 11.5 2 12v4c0 .6.4 1 1 1h2m0 0a2 2 0 1 0 4 0m-4 0a2 2 0 1 1 4 0m6 0a2 2 0 1 0 4 0m-4 0a2 2 0 1 1 4 0',
} as const;

export type ArenaIconName = keyof typeof PATHS;

export function ArenaIcon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: ArenaIconName }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
