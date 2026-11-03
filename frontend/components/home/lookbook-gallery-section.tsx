'use client';

interface LookbookFrame {
  id: string;
  cols: string;
  frameBadge: string;
  badgeColor?: string;
  badgeTextColor?: string;
  tagline: string;
  title: string;
  description: string;
  priceNote?: string;
  image: string;
  aspectClass: string;
}

const FRAMES: LookbookFrame[] = [
  {
    id: 'frame-1',
    cols: 'md:col-span-7',
    frameBadge: 'FRAME 01 // CENTER COURT PRO',
    badgeColor: 'bg-black/70',
    badgeTextColor: 'text-vipGold border border-vipGold/30',
    tagline: 'THE DISCIPLINE OF THE DINK',
    title: 'Center Court Pro 1',
    description:
      'Độ ma sát bề mặt Silica đạt chuẩn USAPA, giúp mọi cú đánh drop shot đạt điểm rơi hoàn hảo.',
    priceNote: '280.000 ₫/H • Đèn chuẩn thi đấu',
    image: '/courts/court-1.jpg',
    aspectClass: 'aspect-[16/10]',
  },
  {
    id: 'frame-2',
    cols: 'md:col-span-5',
    frameBadge: 'FRAME 02 // CHAMPIONSHIP ARENA',
    badgeColor: 'bg-black/70',
    badgeTextColor: 'text-emeraldPro border border-emeraldPro/30',
    tagline: 'HIGH-CONTRAST VISUAL LINES',
    title: 'Championship Arena 2',
    description:
      'Sân thi đấu với tông màu xanh đại dương, tích hợp khán đài mini.',
    priceNote: '240.000 ₫/H • Đèn chuẩn thi đấu',
    image: '/courts/court-2.jpg',
    aspectClass: 'aspect-[16/10] md:aspect-auto',
  },
  {
    id: 'frame-3',
    cols: 'md:col-span-4',
    frameBadge: 'FRAME 03 // STD 3',
    tagline: 'HIGH-GRIP SURFACE',
    title: 'Pickle Standard 3',
    description:
      'Tối ưu cho các buổi tập luyện cường độ cao và giao lưu câu lạc bộ.',
    priceNote: '170.000 ₫/H',
    image: '/courts/court-3.jpg',
    aspectClass: 'aspect-[4/3]',
  },
  {
    id: 'frame-4',
    cols: 'md:col-span-4',
    frameBadge: 'FRAME 04 // STD 4',
    tagline: 'ELASTIC CUSHION',
    title: 'Dynamic Court 4',
    description:
      'Mặt sân đàn hồi Elastic Cushion, bảo vệ khớp gối cho mọi lứa tuổi.',
    priceNote: '160.000 ₫/H',
    image: '/courts/court-4.jpg',
    aspectClass: 'aspect-[4/3]',
  },
  {
    id: 'frame-5',
    cols: 'md:col-span-4',
    frameBadge: 'FRAME 05 // ARENA WIDE',
    badgeTextColor: 'text-volt',
    tagline: '4 COURTS FULL INDOOR',
    title: 'Toàn Cảnh Cụm Sân',
    description:
      'Góc nhìn minh họa từ trên cao bao quát 4 sân đấu tại cơ sở thử nghiệm.',
    priceNote: '4 SÂN TRONG NHÀ',
    image: '/courts/court-overview-angle.jpg',
    aspectClass: 'aspect-[4/3]',
  },
];

export function LookbookGallerySection({
  onOpenLightbox,
}: {
  onOpenLightbox?: (src: string, title: string, caption: string) => void;
}) {
  return (
    <section id="lookbook-gallery" className="py-16 sm:py-24 hairline-b">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8">
        {/* Section Title */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-10 hairline-b">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-emeraldPro pulse-dot" />
              <span className="text-[11px] font-mono text-emeraldPro uppercase tracking-widest font-semibold">
                BỘ SƯU TẬP KHÔNG GIAN
              </span>
            </div>
            <div className="flex flex-wrap items-baseline gap-4">
              <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight uppercase text-[var(--text-primary)]">
                COURT CULTURE LOOKBOOK
              </h2>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              Hình ảnh minh họa không gian thi đấu tại SMASH ARENA — Hà Nội (Cơ
              sở thử nghiệm)
            </p>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs opacity-60 text-[var(--text-secondary)]">
            <span>HÀ NỘI 2026</span>
          </div>
        </div>

        {/* Editorial Asymmetric Photo Grid */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-12 gap-6">
          {FRAMES.map((frame) => (
            <div
              key={frame.id}
              className={`${frame.cols} rounded-2xl hairline-box bg-[var(--bg-secondary)] overflow-hidden relative group cursor-pointer ${frame.aspectClass} shadow-xl`}
              onClick={() =>
                onOpenLightbox?.(frame.image, frame.title, frame.description)
              }
            >
              <img
                src={frame.image}
                alt={frame.title}
                className="w-full h-full object-cover zoom-hover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent pointer-events-none" />

              {/* Badge */}
              <div className="absolute top-4 left-4 z-10">
                <span
                  className={`px-3 py-1 rounded backdrop-blur-md text-[10px] font-mono ${
                    frame.badgeColor || 'bg-black/70'
                  } ${frame.badgeTextColor || 'text-white/80'}`}
                >
                  {frame.frameBadge}
                </span>
              </div>

              {/* Bottom text */}
              <div className="absolute bottom-5 left-5 right-5 text-white z-10">
                <span className="text-xs font-mono text-emeraldPro block font-semibold">
                  {frame.tagline}
                </span>
                <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight mt-1 uppercase text-white">
                  {frame.title}
                </h3>
                <p className="text-xs text-white/70 mt-1 max-w-md hidden sm:block">
                  {frame.description}
                </p>
                {frame.priceNote && (
                  <span className="text-[11px] font-mono text-volt mt-1 block">
                    {frame.priceNote}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
