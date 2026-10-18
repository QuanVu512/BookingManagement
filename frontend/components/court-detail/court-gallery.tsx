'use client';
/** @deprecated Legacy static court-detail mockup. Not part of the live route; use frontend/features/courts instead. */

import Image from 'next/image';
import type { CourtItem } from '../../types/auth';
import type { CourtGalleryImage } from '../../types/court-booking';
import { BOOKING_CONFIG } from '../../lib/court-booking';
import { BookingIcon } from './booking-icon';
import { useGalleryMotion, type GalleryMotion } from './use-court-motion';

function CourtHeading({ court }: { court: CourtItem }) {
  return (
    <div className="cb-court-heading">
      <div className="cb-badges">
        <span className="cb-badge cb-badge-blue">Mái che & Đèn LED</span>
      </div>
      <h1>
        {court.name} — {BOOKING_CONFIG.club}
      </h1>
      <p className="cb-address">
        <BookingIcon name="location" />
        {BOOKING_CONFIG.address}
      </p>
      <p className="cb-court-intro">
        Xem ảnh và tiện ích của sân, chọn ngày để tham khảo lịch theo khung giờ,
        rồi thêm dịch vụ phù hợp vào đơn. Lịch và giá trong bản xem trước là dữ
        liệu minh họa.
      </p>
    </div>
  );
}

function GalleryControls({
  onPrevious,
  onNext,
}: {
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="cb-gallery-controls">
      <button
        type="button"
        data-gallery-prev
        onClick={onPrevious}
        aria-label="Ảnh sân trước"
      >
        <BookingIcon name="arrow" className="cb-arrow-back" />
      </button>
      <button
        type="button"
        data-gallery-next
        onClick={onNext}
        aria-label="Ảnh sân tiếp theo"
      >
        <BookingIcon name="arrow" />
      </button>
    </div>
  );
}

function GalleryPhoto({
  index,
  motion,
}: {
  index: number;
  motion: GalleryMotion;
}) {
  const photo = BOOKING_CONFIG.gallery[index];
  const isDisplayed = index === motion.state.displayed;
  const isPending = !isDisplayed && index === motion.state.requested;
  const role = isDisplayed ? 'displayed' : isPending ? 'pending' : 'previous';
  return (
    <Image
      key={index}
      className={`cb-gallery-photo cb-gallery-photo--${role}`}
      data-gallery-role={role}
      data-gallery-main={isDisplayed ? true : undefined}
      ref={isDisplayed ? motion.imageRef : undefined}
      src={photo.src}
      alt={photo.alt}
      aria-hidden={!isDisplayed}
      fill
      sizes="(max-width: 900px) 100vw, 52vw"
      priority={isDisplayed}
      loading={isPending ? 'eager' : undefined}
      onLoad={isPending ? () => motion.onReady(index) : undefined}
      onError={() => motion.onError(index)}
    />
  );
}

function GalleryImages({ motion }: { motion: GalleryMotion }) {
  const indices = [
    ...new Set(
      [
        motion.state.displayed,
        motion.state.previous,
        motion.state.requested,
      ].filter((index): index is number => index !== null),
    ),
  ];
  return (
    <>
      {indices.map((index) => (
        <GalleryPhoto key={index} index={index} motion={motion} />
      ))}
    </>
  );
}

function MainPhoto({ motion }: { motion: GalleryMotion }) {
  const photo = BOOKING_CONFIG.gallery[motion.state.displayed];
  return (
    <div
      className="cb-gallery-main"
      aria-busy={motion.state.requested !== motion.state.displayed}
    >
      <GalleryImages motion={motion} />
      <span className="cb-photo-label" data-gallery-caption>
        {photo.caption}
      </span>
      <GalleryControls
        onPrevious={() => motion.onMove(-1)}
        onNext={() => motion.onMove(1)}
      />
    </div>
  );
}

function GalleryThumbnail({
  photo,
  index,
  isSelected,
  onSelect,
}: {
  photo: CourtGalleryImage;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      key={photo.src}
      data-gallery-index={index}
      aria-label={`Xem ảnh ${photo.caption}`}
      aria-pressed={isSelected}
      onClick={onSelect}
    >
      <Image
        src={photo.src}
        alt={photo.alt}
        fill
        sizes="(max-width: 900px) 30vw, 15vw"
      />
      <span>{photo.caption}</span>
    </button>
  );
}

function CourtFeatures({ court }: { court: CourtItem }) {
  return (
    <div className="cb-court-features">
      <span>{court.surfaceType}</span>
      {court.features.map((feature) => (
        <span key={feature}>
          <BookingIcon name="check" />
          {feature}
        </span>
      ))}
    </div>
  );
}

function GalleryThumbnails({ motion }: { motion: GalleryMotion }) {
  const gallery = BOOKING_CONFIG.gallery;
  return (
    <div className="cb-thumbnails">
      {gallery.slice(1).map((photo, index) => (
        <GalleryThumbnail
          key={photo.src}
          photo={photo}
          index={index + 1}
          isSelected={motion.state.displayed === index + 1}
          onSelect={() => motion.onSelect(index + 1)}
        />
      ))}
    </div>
  );
}

export function CourtGallery({ court }: { court: CourtItem }) {
  const motion = useGalleryMotion(BOOKING_CONFIG.gallery.length);
  return (
    <section
      className="cb-panel cb-gallery-panel"
      aria-label="Thông tin và hình ảnh sân"
    >
      <CourtHeading court={court} />
      <div className="cb-gallery">
        <MainPhoto motion={motion} />
        <GalleryThumbnails motion={motion} />
      </div>
      <CourtFeatures court={court} />
      {motion.state.error && (
        <p className="cb-gallery-error" role="status">
          {motion.state.error}
        </p>
      )}
    </section>
  );
}
