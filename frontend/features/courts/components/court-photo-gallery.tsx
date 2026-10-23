'use client';

import { useState } from 'react';

const ILLUSTRATIONS = [
  { src: '/courts/court-overview-angle.jpg', label: 'Toàn cảnh sân' },
  { src: '/courts/court-2.jpg', label: 'Lưới & dụng cụ' },
  { src: '/courts/court-3.jpg', label: 'Không gian thi đấu' },
  { src: '/courts/court-4.jpg', label: 'Góc sân' },
];

function galleryPhotos(src: string, courtName: string) {
  const primary = { src, label: courtName };
  if (!/^\/courts\/court-[1-4]\.jpg$/.test(src)) return [primary];
  return [primary, ...ILLUSTRATIONS.filter((photo) => photo.src !== src)];
}

export function CourtPhotoGallery({
  src,
  courtName,
}: {
  src: string;
  courtName: string;
}) {
  const photos = galleryPhotos(src, courtName);
  const [selected, setSelected] = useState(0);
  const active = photos[selected] ?? photos[0];
  return (
    <div className="court-photo-gallery">
      <div className="court-detail-media">
        <img
          src={active.src}
          alt={`Ảnh minh họa: ${active.label}`}
          className="court-detail-image"
          decoding="async"
        />
      </div>
      {photos.length > 1 && (
        <div
          className="court-photo-thumbnails"
          aria-label="Ảnh minh họa sân Pickleball"
        >
          {photos.map((photo, index) => (
            <button
              type="button"
              key={photo.src}
              aria-label={`Xem ảnh ${photo.label}`}
              aria-pressed={selected === index}
              onClick={() => setSelected(index)}
            >
              <img
                src={photo.src}
                alt=""
                width="160"
                height="100"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
