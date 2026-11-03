'use client';

import { useState } from 'react';
import type { CourtItem } from '../../features/courts/model/court';
import { formatVnd } from '../../features/booking/model/booking-time';

interface MatrixCourt {
  id: string;
  code: string;
  name: string;
  courtType: 'VIP' | 'STANDARD';
  pricePerHour: number;
  image: string;
}

const TIME_SLOTS = [
  '08:00',
  '09:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
  '21:00',
];

// Pre-seeded occupied slots pattern for realistic representation
const OCCUPIED_SLOTS: Record<string, string[]> = {
  'court-1': ['17:00'],
  'court-2': ['19:00'],
  'court-3': ['18:00'],
  'court-4': [],
};

export function LiveScheduleMatrix({ courts }: { courts?: CourtItem[] }) {
  const [selectedDate, setSelectedDate] = useState<'today' | 'tomorrow' | 'weekend'>('today');

  const matrixCourts: MatrixCourt[] =
    courts && courts.length > 0
      ? courts.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          courtType: c.courtType as 'VIP' | 'STANDARD',
          pricePerHour: c.pricePerHour,
          image: c.imageUrl || '/courts/court-1.jpg',
        }))
      : [];

  return (
    <section id="live-matrix" className="py-16 sm:py-24 hairline-b bg-[var(--bg-secondary)]/35">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-emeraldPro pulse-dot" />
              <span className="text-[11px] font-mono text-emeraldPro uppercase tracking-widest font-semibold">
                BẢNG GIỜ THỰC TẾ
              </span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight uppercase text-[var(--text-primary)]">
              LỊCH SÂN ĐẤU
            </h2>
          </div>

          {/* Date Selector Pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setSelectedDate('today')}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
                selectedDate === 'today'
                  ? 'bg-emeraldPro text-obsidian shadow-md'
                  : 'hairline-box bg-[var(--bg-primary)] opacity-75 hover:opacity-100 text-[var(--text-primary)]'
              }`}
            >
              HÔM NAY
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate('tomorrow')}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
                selectedDate === 'tomorrow'
                  ? 'bg-emeraldPro text-obsidian shadow-md'
                  : 'hairline-box bg-[var(--bg-primary)] opacity-75 hover:opacity-100 text-[var(--text-primary)]'
              }`}
            >
              NGÀY MAI
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate('weekend')}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
                selectedDate === 'weekend'
                  ? 'bg-emeraldPro text-obsidian shadow-md'
                  : 'hairline-box bg-[var(--bg-primary)] opacity-75 hover:opacity-100 text-[var(--text-primary)]'
              }`}
            >
              CUỐI TUẦN
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-6 mb-5 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-emeraldPro/20 border border-emeraldPro" />
            <span className="text-[var(--text-secondary)]">Sân trống</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-white/5 border border-white/10 opacity-40" />
            <span className="text-[var(--text-secondary)] opacity-60">Sân đã đặt</span>
          </div>
          <div className="ml-auto text-emeraldPro text-[11px] font-semibold">
            ✓ Tự động cộng 15 phút vệ sinh sân miễn phí giữa mỗi ca
          </div>
        </div>

        {/* Matrix Table Wrapper */}
        {matrixCourts.length === 0 ? (
          <div className="rounded-2xl hairline-box bg-[var(--bg-primary)] p-12 text-center text-xs font-mono text-[var(--text-secondary)]">
            Chưa có dữ liệu từ backend — Vui lòng bật backend để tải bảng lịch sân.
          </div>
        ) : (
          <div className="rounded-2xl hairline-box bg-[var(--bg-primary)] overflow-x-auto shadow-xl">
            <table className="w-full text-left border-collapse min-w-[780px]">
              <thead>
                <tr className="hairline-b text-[11px] font-mono uppercase opacity-60">
                  <th className="p-4 w-72 hairline-r">Sân đấu / Hạng sân</th>
                  {TIME_SLOTS.map((time) => (
                    <th key={time} className="p-3 text-center">
                      {time}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)] text-xs font-mono">
                {matrixCourts.map((court) => (
                  <tr key={court.id} className="hover:bg-[var(--bg-secondary)]/40 transition-colors">
                    <td className="p-4 hairline-r">
                      <div className="flex items-center gap-3">
                        <img
                          src={court.image}
                          alt={court.name}
                          className="w-9 h-9 rounded-lg object-cover flex-shrink-0 border border-white/10"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                court.courtType === 'VIP'
                                  ? 'bg-vipGold text-obsidian'
                                  : 'bg-emeraldPro text-obsidian'
                              }`}
                            >
                              {court.code}
                            </span>
                            <span className="font-sans font-bold text-sm text-[var(--text-primary)]">
                              {court.name}
                            </span>
                          </div>
                          <span className="text-[11px] opacity-60 block mt-0.5">
                            {formatVnd(court.pricePerHour)} / Giờ
                          </span>
                        </div>
                      </div>
                    </td>

                    {TIME_SLOTS.map((time) => {
                      const isOccupied = OCCUPIED_SLOTS[court.id]?.includes(time);

                      if (isOccupied) {
                        return (
                          <td key={time} className="p-2 text-center">
                            <div className="py-2.5 rounded-lg bg-white/5 opacity-40 text-[11px] text-[var(--text-secondary)] select-none font-medium">
                              Đã đặt
                            </div>
                          </td>
                        );
                      }

                      return (
                        <td key={time} className="p-2 text-center">
                          <div className="py-2.5 rounded-lg bg-emeraldPro/15 border border-emeraldPro/30 text-emeraldPro font-semibold text-[11px] select-none">
                            Trống
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
