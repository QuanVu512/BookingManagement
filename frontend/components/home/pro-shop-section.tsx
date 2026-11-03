'use client';

import { formatVnd } from '../../features/booking/model/booking-time';

interface ProductItem {
  id: string;
  name: string;
  category: string;
  badge: string;
  badgeColor: string;
  badgeTextColor: string;
  price: number;
  unit: string;
  image: string;
  actionText: string;
}

const PRODUCTS: ProductItem[] = [
  {
    id: 'prod-paddle',
    name: 'SLK Halo Power T700',
    category: 'THIẾT BỊ THI ĐẤU',
    badge: 'PRO RENTAL',
    badgeColor: 'bg-vipGold',
    badgeTextColor: 'text-obsidian',
    price: 50000,
    unit: 'cây',
    image: '/products/paddle-carbon.jpg',
    actionText: '+ Thuê',
  },
  {
    id: 'prod-balls',
    name: 'Franklin X-40 Optic',
    category: 'BÓNG THI ĐẤU',
    badge: 'USAPA BALL',
    badgeColor: 'bg-emeraldPro',
    badgeTextColor: 'text-obsidian',
    price: 120000,
    unit: 'set 3 quả',
    image: '/products/franklin-balls.png',
    actionText: '+ Mua',
  },
  {
    id: 'prod-pocari',
    name: 'Pocari Sweat 500ml',
    category: 'ĐỒ UỐNG THỂ THAO',
    badge: 'ION RECHARGE',
    badgeColor: 'bg-blue-500',
    badgeTextColor: 'text-white',
    price: 25000,
    unit: 'chai ướp lạnh',
    image: '/products/pocari.png',
    actionText: '+ Thêm',
  },
  {
    id: 'prod-aquarius',
    name: 'Aquarius Zero 500ml',
    category: 'ĐỒ UỐNG NĂNG LƯỢNG',
    badge: 'ZERO CALORIE',
    badgeColor: 'bg-cyan-500',
    badgeTextColor: 'text-obsidian',
    price: 20000,
    unit: 'chai ướp lạnh',
    image: '/products/aquarius.png',
    actionText: '+ Thêm',
  },
  {
    id: 'prod-dasani',
    name: 'Dasani Pure 500ml',
    category: 'NƯỚC TINH KHIẾT',
    badge: 'PURE HYDRATION',
    badgeColor: 'bg-emerald-600',
    badgeTextColor: 'text-white',
    price: 15000,
    unit: 'chai ướp lạnh',
    image: '/products/dasani.png',
    actionText: '+ Thêm',
  },
];

export function ProShopSection() {
  return (
    <section id="pro-shop" className="py-16 sm:py-24 hairline-b bg-[var(--bg-secondary)]/40 relative">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8">
        {/* Section Heading */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-10 hairline-b">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-emeraldPro/15 text-emeraldPro border border-emeraldPro/30">
                Tại quầy lễ tân
              </span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight uppercase text-[var(--text-primary)]">
              DỊCH VỤ ĐI KÈM
            </h2>
          </div>
        </div>

        {/* 5 Real Products Showcase Grid */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {PRODUCTS.map((prod) => (
            <div
              key={prod.id}
              className="rounded-2xl hairline-box bg-[var(--bg-primary)] p-5 flex flex-col justify-between group hover:border-emeraldPro transition-all duration-300 shadow-lg"
            >
              <div>
                <div className="relative rounded-xl overflow-hidden bg-[#0A130E] p-4 flex items-center justify-center aspect-square mb-4">
                  <span
                    className={`absolute top-2.5 left-2.5 px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${prod.badgeColor} ${prod.badgeTextColor}`}
                  >
                    {prod.badge}
                  </span>
                  <img
                    src={prod.image}
                    alt={prod.name}
                    className="max-h-[140px] w-auto object-contain zoom-hover drop-shadow-xl"
                  />
                </div>
                <span className="text-[10px] font-mono text-emeraldPro uppercase tracking-wider block font-semibold">
                  {prod.category}
                </span>
                <h3 className="font-extrabold text-base tracking-tight mt-1 text-[var(--text-primary)]">
                  {prod.name}
                </h3>
              </div>

              <div className="mt-5 pt-3 hairline-t flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono opacity-50 block">{prod.unit}</span>
                  <span className="font-mono font-bold text-sm text-volt">
                    {formatVnd(prod.price)}
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-emeraldPro/10 text-emeraldPro text-[11px] font-mono font-medium">
                  Tại quầy
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
