'use client';

import { useEffect } from 'react';

interface LightboxProps {
  isOpen: boolean;
  src: string;
  title: string;
  caption: string;
  onClose: () => void;
}

export function ImageLightboxModal({
  isOpen,
  src,
  title,
  caption,
  onClose,
}: LightboxProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative max-w-5xl w-full rounded-2xl overflow-hidden hairline-box bg-[#060807] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="p-4 hairline-b flex items-center justify-between bg-[var(--bg-secondary)]/90 text-white">
          <div>
            <h3 className="font-extrabold text-base uppercase text-white">{title}</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">{caption}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng ảnh phóng to"
            className="w-9 h-9 rounded-lg hairline-box flex items-center justify-center text-white hover:border-emeraldPro hover:text-emeraldPro transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Image Container */}
        <div className="relative aspect-[16/10] max-h-[75vh] bg-black flex items-center justify-center">
          <img
            src={src}
            alt={title}
            className="w-full h-full object-contain"
          />
        </div>
      </div>
    </div>
  );
}
