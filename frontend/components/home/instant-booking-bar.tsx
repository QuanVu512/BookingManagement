'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { CourtItem } from '../../features/courts/model/court';
import { formatVnd } from '../../features/booking/model/booking-time';

const SLOTS = [
  '17:00 - 18:00 (Còn trống)',
  '18:00 - 19:00 (Prime Time)',
  '19:00 - 20:00 (Prime Time)',
  '20:00 - 21:00 (Night Club)',
];

export function InstantBookingBar({ courts }: { courts?: CourtItem[] }) {
  const options =
    courts && courts.length > 0
      ? courts.map((c) => ({
          id: c.id,
          name: `${c.name} (${c.courtType === 'VIP' ? 'VIP' : 'Tiêu chuẩn'} • ${Math.round(c.pricePerHour / 1000)}k/h)`,
          price: c.pricePerHour,
        }))
      : [];

  const [selectedCourtIndex, setSelectedCourtIndex] = useState(0);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(0);

  const hasCourts = options.length > 0;
  const selectedCourt = hasCourts ? (options[selectedCourtIndex] || options[0]) : null;
  const selectedSlot = SLOTS[selectedSlotIndex] || SLOTS[0];
  const slotClean = selectedSlot.split(' ')[0];

  return (
    <div className="hairline-b bg-[var(--bg-secondary)]/90 backdrop-blur-md">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Header */}
          <div className="md:col-span-3 flex items-center gap-3">
            <div className="w-2 h-8 rounded-full bg-emeraldPro flex-shrink-0" />
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-emeraldPro block font-semibold">
                TRA CỨU & GIỮ CHỖ TỨC THÌ
              </span>
              <span className="font-bold text-sm text-[var(--text-primary)]">
                Chọn nhanh lượt chơi hôm nay
              </span>
            </div>
          </div>

          {/* Filter 1: Hạng sân đấu */}
          <div className="md:col-span-3 hairline-box rounded-xl px-3.5 py-2 bg-[var(--bg-primary)]">
            <label htmlFor="instant-court-select" className="text-[10px] font-mono uppercase opacity-50 block">
              Hạng sân đấu
            </label>
            <select
              id="instant-court-select"
              value={hasCourts ? selectedCourtIndex : 0}
              onChange={(e) => setSelectedCourtIndex(Number(e.target.value))}
              disabled={!hasCourts}
              className="w-full bg-transparent text-xs font-semibold focus:outline-none mt-0.5 cursor-pointer text-[var(--text-primary)] disabled:opacity-60"
            >
              {hasCourts ? (
                options.map((opt, idx) => (
                  <option key={opt.id} value={idx} className="bg-[var(--bg-primary)] text-[var(--text-primary)]">
                    {opt.name}
                  </option>
                ))
              ) : (
                <option value={0} className="bg-[var(--bg-primary)] text-[var(--text-primary)]">
                  Chưa có dữ liệu từ backend
                </option>
              )}
            </select>
          </div>

          {/* Filter 2: Khung giờ sẵn sàng */}
          <div className="md:col-span-3 hairline-box rounded-xl px-3.5 py-2 bg-[var(--bg-primary)]">
            <label htmlFor="instant-slot-select" className="text-[10px] font-mono uppercase opacity-50 block">
              Khung giờ sẵn sàng
            </label>
            <select
              id="instant-slot-select"
              value={selectedSlotIndex}
              onChange={(e) => setSelectedSlotIndex(Number(e.target.value))}
              disabled={!hasCourts}
              className="w-full bg-transparent text-xs font-semibold focus:outline-none mt-0.5 cursor-pointer text-[var(--text-primary)] disabled:opacity-60"
            >
              {SLOTS.map((slot, idx) => (
                <option key={slot} value={idx} className="bg-[var(--bg-primary)] text-[var(--text-primary)]">
                  Hôm nay • {slot}
                </option>
              ))}
            </select>
          </div>

          {/* Action Button & Estimated Price */}
          <div className="md:col-span-3 flex items-center justify-between md:justify-end gap-3">
            <div className="text-right">
              <span className="text-[10px] font-mono uppercase opacity-50 block">Tạm tính (1h)</span>
              <span className="font-mono font-bold text-sm text-emeraldPro tabular-nums">
                {selectedCourt ? formatVnd(selectedCourt.price) : '-- ₫'}
              </span>
            </div>
            {hasCourts && selectedCourt ? (
              <Link
                href={`/booking?courtId=${encodeURIComponent(selectedCourt.id)}&slot=${encodeURIComponent(slotClean)}`}
                className="h-11 px-5 rounded-xl bg-emeraldPro hover:bg-volt text-obsidian font-extrabold text-xs uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5 shadow-md"
              >
                <span>Giữ chỗ ngay</span>
                <span>→</span>
              </Link>
            ) : (
              <span
                className="h-11 px-5 rounded-xl bg-white/10 text-white/40 font-mono font-bold text-xs uppercase tracking-wider whitespace-nowrap flex items-center justify-center cursor-not-allowed"
                title="Vui lòng bật backend để tải danh sách sân đấu"
              >
                Chưa thể đặt
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
