'use client';

import React, { useState } from 'react';
import { CourtItem } from '../../types/auth';
import { useAuthSession } from '../../context/auth-context';

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} phút`;
  if (m === 0) return `${h} giờ`;
  return `${h} giờ ${m} phút`;
}

// 15-minute increment duration options
const DURATION_OPTIONS = [
  { minutes: 45, label: '45 phút' },
  { minutes: 60, label: '1 giờ' },
  { minutes: 75, label: '1 giờ 15 phút' },
  { minutes: 90, label: '1 giờ 30 phút' },
  { minutes: 105, label: '1 giờ 45 phút' },
  { minutes: 120, label: '2 giờ' },
  { minutes: 135, label: '2 giờ 15 phút' },
  { minutes: 150, label: '2 giờ 30 phút' },
  { minutes: 165, label: '2 giờ 45 phút' },
  { minutes: 180, label: '3 giờ' },
  { minutes: 210, label: '3 giờ 30 phút' },
  { minutes: 240, label: '4 giờ' },
];

export function BookingModal({
  court,
  onClose,
}: {
  court: CourtItem | null;
  onClose: () => void;
}) {
  const { user, isAuthenticated } = useAuthSession();

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('08:00');
  const [durationMinutes, setDurationMinutes] = useState(90); // default 1h30

  // Personal Information inputs
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  const [isSuccess, setIsSuccess] = useState(false);
  const [bookingCode, setBookingCode] = useState('');

  if (!court) return null;

  const totalPrice = Math.round((court.pricePerHour * durationMinutes) / 60);

  const handleAdjustDuration = (deltaMinutes: number) => {
    setDurationMinutes((prev) => {
      const next = prev + deltaMinutes;
      if (next < 30) return 30;
      if (next > 360) return 360;
      return next;
    });
  };

  const handleConfirmBooking = (e: React.FormEvent) => {
    e.preventDefault();
    const generatedCode =
      'BK-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    setBookingCode(generatedCode);
    setIsSuccess(true);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '520px' }}
      >
        <div className="modal-header">
          <div>
            <span
              className={
                court.courtType === 'VIP'
                  ? 'badge badge-vip'
                  : 'badge badge-standard'
              }
            >
              {court.courtType === 'VIP' ? 'VIP COURT' : 'TIÊU CHUẨN'}
            </span>
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: '#fff',
                marginTop: '6px',
              }}
            >
              Xác nhận đặt sân: {court.name}
            </h2>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="modal-body">
          {isSuccess ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div
                style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  background: 'rgba(163, 230, 53, 0.15)',
                  border: '2px solid var(--accent-volt)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.8rem',
                  margin: '0 auto 16px',
                  color: 'var(--accent-volt)',
                }}
              >
                ✓
              </div>
              <h3
                style={{
                  fontSize: '1.3rem',
                  fontWeight: 700,
                  color: '#fff',
                  marginBottom: '8px',
                }}
              >
                Đặt Sân Thành Công
              </h3>
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '16px',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Mã đặt chỗ
                </div>
                <div
                  style={{
                    fontSize: '1.3rem',
                    fontWeight: 800,
                    color: 'var(--accent-volt)',
                  }}
                >
                  {bookingCode}
                </div>
              </div>

              {/* Status message */}
              {!isAuthenticated ? (
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid rgba(249, 115, 22, 0.3)',
                    padding: '14px',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)',
                    textAlign: 'left',
                    marginBottom: '20px',
                    lineHeight: 1.5,
                  }}
                >
                  <p
                    style={{
                      color: '#fed7aa',
                      fontWeight: 600,
                      marginBottom: '6px',
                    }}
                  >
                    Thông tin đặt chỗ trực tiếp:
                  </p>
                  <p>
                    • Thông báo xác nhận đặt sân đã gửi tới email:{' '}
                    <strong style={{ color: '#fff' }}>{guestEmail}</strong>.
                  </p>
                  <p style={{ color: '#fca5a5', marginTop: '6px' }}>
                    • Do bạn chưa đăng nhập, lịch sử đặt sân sẽ không lưu trên
                    web.
                  </p>
                  <p style={{ color: '#fed7aa', marginTop: '6px' }}>
                    • Lưu ý chính sách: Hủy sân áp dụng mức phí 10% tổng tiền
                    đặt chỗ.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid rgba(163, 230, 53, 0.3)',
                    padding: '14px',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)',
                    textAlign: 'left',
                    marginBottom: '20px',
                    lineHeight: 1.5,
                  }}
                >
                  <p
                    style={{
                      color: 'var(--accent-volt)',
                      fontWeight: 600,
                      marginBottom: '4px',
                    }}
                  >
                    Tài khoản: {user?.fullName}
                  </p>
                  <p>
                    Thông tin đặt sân đã được lưu vào hệ thống và gửi email xác
                    nhận.
                  </p>
                  <p style={{ color: '#fed7aa', marginTop: '6px' }}>
                    Lưu ý: Hủy sân áp dụng mức phí 10% tổng tiền đặt chỗ.
                  </p>
                </div>
              )}

              <button
                type="button"
                className="btn btn-primary"
                onClick={onClose}
                style={{ width: '100%' }}
              >
                Hoàn tất và đóng
              </button>
            </div>
          ) : (
            <form onSubmit={handleConfirmBooking}>
              {/* Booking schedule controls */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                }}
              >
                <div className="form-group">
                  <label className="form-label">Ngày chơi:</label>
                  <input
                    type="date"
                    className="form-input"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Giờ bắt đầu:</label>
                  <select
                    className="form-input"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  >
                    <option value="06:00">06:00 Sáng</option>
                    <option value="06:30">06:30 Sáng</option>
                    <option value="07:00">07:00 Sáng</option>
                    <option value="07:30">07:30 Sáng</option>
                    <option value="08:00">08:00 Sáng</option>
                    <option value="08:30">08:30 Sáng</option>
                    <option value="09:00">09:00 Sáng</option>
                    <option value="09:30">09:30 Sáng</option>
                    <option value="10:00">10:00 Sáng</option>
                    <option value="14:00">14:00 Chiều</option>
                    <option value="15:00">15:00 Chiều</option>
                    <option value="16:00">16:00 Chiều</option>
                    <option value="17:00">17:00 Chiều</option>
                    <option value="18:00">18:00 Tối</option>
                    <option value="19:00">19:00 Tối</option>
                    <option value="20:00">20:00 Tối</option>
                    <option value="21:00">21:00 Tối</option>
                  </select>
                </div>
              </div>

              {/* Flexible duration selector in 15-minute increments */}
              <div className="form-group">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px',
                  }}
                >
                  <label className="form-label" style={{ marginBottom: 0 }}>
                    Thời lượng thuê sân:
                  </label>
                  <span
                    style={{
                      fontSize: '0.82rem',
                      color: 'var(--accent-volt)',
                      fontWeight: 600,
                    }}
                  >
                    Bước nhảy 15 phút
                  </span>
                </div>

                <div
                  style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
                >
                  <button
                    type="button"
                    onClick={() => handleAdjustDuration(-15)}
                    className="btn btn-secondary btn-sm"
                    style={{
                      padding: '8px 14px',
                      fontSize: '1rem',
                      fontWeight: 700,
                    }}
                    title="Giảm 15 phút"
                  >
                    -
                  </button>

                  <select
                    className="form-input"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    style={{ flex: 1, textAlign: 'center', fontWeight: 600 }}
                  >
                    {DURATION_OPTIONS.map((opt) => (
                      <option key={opt.minutes} value={opt.minutes}>
                        {opt.label}
                      </option>
                    ))}
                    {!DURATION_OPTIONS.some(
                      (o) => o.minutes === durationMinutes,
                    ) && (
                      <option value={durationMinutes}>
                        {formatDuration(durationMinutes)}
                      </option>
                    )}
                  </select>

                  <button
                    type="button"
                    onClick={() => handleAdjustDuration(15)}
                    className="btn btn-secondary btn-sm"
                    style={{
                      padding: '8px 14px',
                      fontSize: '1rem',
                      fontWeight: 700,
                    }}
                    title="Tăng 15 phút"
                  >
                    +
                  </button>
                </div>

                {/* Quick preset buttons */}
                <div
                  style={{
                    display: 'flex',
                    gap: '6px',
                    marginTop: '8px',
                    flexWrap: 'wrap',
                  }}
                >
                  {[60, 90, 120, 150, 180].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setDurationMinutes(mins)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background:
                          durationMinutes === mins
                            ? 'var(--accent-lime)'
                            : 'rgba(255,255,255,0.05)',
                        color:
                          durationMinutes === mins
                            ? 'var(--text-dark)'
                            : 'var(--text-secondary)',
                        border: '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {formatDuration(mins)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Personal Information */}
              {!isAuthenticated && (
                <div
                  style={{
                    background: 'rgba(0, 0, 0, 0.25)',
                    border: '1px solid var(--border-subtle)',
                    padding: '14px',
                    borderRadius: 'var(--radius-md)',
                    marginTop: '12px',
                    marginBottom: '16px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: 'var(--accent-volt)',
                      marginBottom: '10px',
                    }}
                  >
                    Thông tin cá nhân:
                  </div>
                  <div className="form-group" style={{ marginBottom: '10px' }}>
                    <label className="form-label">Họ và tên:</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Nguyễn Văn A"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '10px' }}>
                    <label className="form-label">Email liên hệ:</label>
                    <input
                      type="email"
                      className="form-input"
                      placeholder="example@gmail.com"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '0' }}>
                    <label className="form-label">Số điện thoại liên hệ:</label>
                    <input
                      type="tel"
                      className="form-input"
                      placeholder="03xxxxxxxx"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              {/* Total Calculation - Clean without parentheses */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  padding: '14px',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div
                    style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}
                  >
                    Tổng thanh toán
                  </div>
                  <div
                    style={{
                      fontSize: '0.78rem',
                      color: 'var(--text-secondary)',
                      marginTop: '2px',
                    }}
                  >
                    Đơn giá: {court.pricePerHour.toLocaleString('vi-VN')} đ/giờ
                    • Thời lượng: {formatDuration(durationMinutes)}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: '1.35rem',
                    fontWeight: 800,
                    color: 'var(--accent-volt)',
                  }}
                >
                  {totalPrice.toLocaleString('vi-VN')} đ
                </div>
              </div>

              {/* Cancellation Policy Banner */}
              <div
                style={{
                  fontSize: '0.76rem',
                  color: 'var(--text-muted)',
                  marginBottom: '16px',
                  lineHeight: 1.4,
                  background: 'rgba(249, 115, 22, 0.08)',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(249, 115, 22, 0.2)',
                }}
              >
                ⚠️ <strong>Chính sách hủy sân:</strong> Khi hủy sẽ áp dụng mức
                phạt 10% tổng tiền đặt chỗ.
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%' }}
              >
                Xác nhận đặt chỗ
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
