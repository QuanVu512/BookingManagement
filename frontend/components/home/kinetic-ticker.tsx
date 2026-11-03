'use client';

export function KineticTicker() {
  const items = [
    '★ SMASH ARENA PICKLEBALL CLUB',
    '4 SÂN ĐẤU TIÊU CHUẨN QUỐC TẾ (2 SÂN VIP • 2 SÂN TIÊU CHUẨN)',
    'MẶT SÂN CUSHION PRO TRONG NHÀ GIẢM CHẤN',
    'VỆ SINH SÂN 15 PHÚT SAU MỖI LƯỢT CHƠI',
    'BÁO GIÁ TRỰC TIẾP TỪ MÁY CHỦ — MINH BẠCH 100%',
    'HÀ NỘI — CƠ SỞ THỬ NGHIỆM',
  ];

  return (
    <div
      className="hairline-b bg-emeraldPro text-obsidian py-2.5 overflow-hidden select-none"
      aria-hidden="true"
    >
      <div className="animate-marquee font-mono text-xs font-bold uppercase tracking-widest flex items-center gap-8">
        {items.map((item, idx) => (
          <span
            key={`ticker-1-${idx}`}
            className="flex items-center gap-8 whitespace-nowrap"
          >
            <span>{item}</span>
            <span>•</span>
          </span>
        ))}
        {/* Duplicated for smooth endless loop */}
        {items.map((item, idx) => (
          <span
            key={`ticker-2-${idx}`}
            className="flex items-center gap-8 whitespace-nowrap"
          >
            <span>{item}</span>
            <span>•</span>
          </span>
        ))}
      </div>
    </div>
  );
}
