import type { SVGProps } from 'react';

export function ArenaLogo({
  size = 24,
  className = '',
  ...props
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Đường dẫn thân chữ S tốc độ */}
      <path
        d="M68 28C62 20 45 20 38 27C30 35 34 46 48 50C64 54 68 64 62 74C56 83 40 83 32 76"
        stroke="#10e760"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Mặt vợt Pickleball hình học ở nửa dưới */}
      <rect
        x="36"
        y="52"
        width="28"
        height="34"
        rx="7"
        fill="#0b1220"
        stroke="#4ade80"
        strokeWidth="2.5"
      />
      <line
        x1="50"
        y1="58"
        x2="50"
        y2="78"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeDasharray="3 2"
      />
      {/* Cán vợt tiếp tuyến đuôi chữ S */}
      <path
        d="M50 86H34"
        stroke="#4ade80"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <line x1="42" y1="83" x2="42" y2="89" stroke="#0b1220" strokeWidth="1.8" />
      {/* Quả bóng Pickleball tại góc đỉnh trên chữ S */}
      <circle
        cx="62"
        cy="22"
        r="10"
        fill="currentColor"
        stroke="#0b1220"
        strokeWidth="2"
      />
      <circle cx="62" cy="22" r="1.6" fill="#0b1220" />
      <circle cx="58" cy="19" r="1.3" fill="#0b1220" />
      <circle cx="66" cy="19" r="1.3" fill="#0b1220" />
      <circle cx="58" cy="25" r="1.3" fill="#0b1220" />
      <circle cx="66" cy="25" r="1.3" fill="#0b1220" />
      {/* Dải khí động học phụ */}
      <path
        d="M42 22C42 18 50 16 56 16"
        stroke="#4ade80"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}
