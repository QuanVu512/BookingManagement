'use client';

import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useModalFocus } from '../../hooks/use-modal-focus';
import { ArenaIcon } from './arena-icon';

function DialogHeading({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="arena-dialog-heading">
      <h2 id="arena-dialog-title">{title}</h2>
      <button
        type="button"
        className="arena-icon-button"
        aria-label="Đóng"
        onClick={onClose}
      >
        <ArenaIcon name="close" />
      </button>
    </div>
  );
}

export function ArenaDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useModalFocus(dialog, onClose);
  return createPortal(
    <div className="arena-modal-overlay">
      <div
        className="arena-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="arena-dialog-title"
        tabIndex={-1}
        ref={dialog}
      >
        <DialogHeading title={title} onClose={onClose} />
        {children}
      </div>
    </div>,
    document.body,
  );
}
