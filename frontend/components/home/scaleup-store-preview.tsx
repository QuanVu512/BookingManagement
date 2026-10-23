'use client';

import React from 'react';

export function ScaleupStorePreview() {
  const futureCategories = [
    {
      title: 'Vợt Thi Đấu Carbon T700',
      subtitle: 'Chuẩn USA Pickleball Approved',
      status: 'Sắp ra mắt',
      tag: 'Thiết Bị',
      image:
        'https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?auto=format&fit=crop&w=800&q=80',
    },
    {
      title: 'Bóng Thi Đấu 40 Lỗ Ngoài Trời',
      subtitle: 'Độ nảy chuẩn xác, độ bền cao',
      status: 'Sắp ra mắt',
      tag: 'Phụ Kiện',
      image:
        'https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff?auto=format&fit=crop&w=800&q=80',
    },
    {
      title: 'Trang Phục Thể Thao Pro Aero',
      subtitle: 'Chất liệu thoáng khí, co giãn 4 chiều',
      status: 'Sắp ra mắt',
      tag: 'Thời Trang',
      image:
        'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80',
    },
  ];

  return (
    <section id="store-preview" className="fig-section fig-shop">
      <div className="fig-inner">
        <div className="fig-section-head">
          <div>
            <h2 className="fig-section-title">
              Chuẩn Bị Ra Mắt: Cửa Hàng Thể Thao
            </h2>
            <p className="fig-section-sub">
              Danh mục phục vụ buổi chơi Pickleball đang được chuẩn bị; chưa mở
              đặt mua
            </p>
          </div>
          <span className="fig-shop-note">Danh mục đang được chuẩn bị</span>
        </div>

        <div className="fig-shop-grid">
          {futureCategories.map((item) => (
            <article key={item.title} className="fig-product-card">
              <div className="fig-product-media">
                <img src={item.image} alt={item.title} loading="lazy" />
              </div>

              <div className="fig-product-body">
                <span className="fig-product-tag">
                  {item.tag.toUpperCase()}
                </span>
                <h3 className="fig-product-name">{item.title}</h3>
                <div className="fig-product-meta">
                  <span>{item.subtitle}</span>
                  <span className="fig-product-status">{item.status}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
