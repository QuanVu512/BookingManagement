'use client';

import Link from 'next/link';
import Image from 'next/image';
import type { CourtItem } from '../../types/auth';
import { COURT_DETAILS_ENABLED } from '../../constants/features';

export function CourtCatalog({ courts }: { courts: CourtItem[] }) {
  return (
    <section
      id="courts-catalog"
      style={{ padding: '64px 0', backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="container">
        {/* Section Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: '32px',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div>
            <div
              className="badge badge-standard"
              style={{ marginBottom: '8px' }}
            >
              Danh mục sân thi đấu
            </div>
            <h2
              style={{
                fontSize: 'clamp(1.7rem, 3.2vw, 2.2rem)',
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
              }}
            >
              Danh sách sân{' '}
              <span className="gradient-volt-text">Pickleball</span>
            </h2>
            <p
              style={{
                color: 'var(--text-secondary)',
                marginTop: '6px',
                fontSize: '0.92rem',
              }}
            >
              So sánh mặt sân, tiện ích và giá thuê theo giờ. Chọn sân phù hợp
              để xem lịch còn trống theo ngày và chuẩn bị lượt chơi của bạn.
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
            }}
          >
            <span>
              Hiển thị:{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {courts.length} sân thi đấu
              </strong>
            </span>
          </div>
        </div>

        {/* E-Commerce Product Grid for Courts */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
            gap: '24px',
          }}
        >
          {courts.map((court) => (
            <div
              key={court.id}
              className="court-card"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                boxShadow: 'var(--shadow-card)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Court Image Banner */}
              <div
                style={{
                  position: 'relative',
                  height: '210px',
                  overflow: 'hidden',
                }}
              >
                <Image
                  src={court.imageUrl}
                  alt={court.name}
                  fill
                  sizes="(max-width: 700px) 100vw, (max-width: 1050px) 50vw, (max-width: 1380px) 33vw, 400px"
                  className="court-card-image"
                />
              </div>

              {/* Card Body */}
              <div
                style={{
                  padding: '20px',
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <h3
                  style={{
                    fontSize: '1.2rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: '6px',
                  }}
                >
                  {court.name}
                </h3>
                <p
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--accent-volt)',
                    marginBottom: '14px',
                    fontWeight: 500,
                  }}
                >
                  🎾 {court.surfaceType}
                </p>

                {/* Features list */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    marginBottom: '18px',
                  }}
                >
                  {court.features.map((feat, idx) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        background: 'var(--bg-pill)',
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-soft)',
                      }}
                    >
                      ✓ {feat}
                    </span>
                  ))}
                </div>

                {/* Price and CTA Button */}
                <div
                  style={{
                    marginTop: 'auto',
                    paddingTop: '16px',
                    borderTop: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                      }}
                    >
                      Giá thuê sân
                    </div>
                    <div
                      style={{
                        fontSize: '1.25rem',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {court.pricePerHour.toLocaleString('vi-VN')}
                      <span
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--text-secondary)',
                          fontWeight: 400,
                          marginLeft: '3px',
                        }}
                      >
                        đ/giờ
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    {COURT_DETAILS_ENABLED ? (
                      <Link
                        href={`/courts/${encodeURIComponent(court.id)}`}
                        className="btn btn-primary"
                      >
                        Đặt sân ngay
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled
                      >
                        Đặt sân sắp ra mắt
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
