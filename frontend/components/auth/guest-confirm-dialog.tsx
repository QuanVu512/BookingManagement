'use client';

import { useRef } from 'react';
import { useAuthActions, useAuthDialog } from '../../context/auth-context';
import { useModalFocus } from '../../hooks/use-modal-focus';

export function GuestConfirmDialog({
  onProceed,
}: { onProceed?: () => void } = {}) {
  const { isGuestConfirmOpen } = useAuthDialog();
  return isGuestConfirmOpen ? <GuestDialog onProceed={onProceed} /> : null;
}

function GuestDialog({ onProceed }: { onProceed?: () => void }) {
  const { closeGuestConfirm, openSignIn, proceedAsGuest } = useAuthActions();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocus(dialogRef, closeGuestConfirm);
  return (
    <div className="modal-overlay">
      <div
        className="modal-content"
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-dialog-title"
      >
        <div className="modal-header">
          <h2 id="guest-dialog-title">Tiếp tục không cần tài khoản</h2>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={closeGuestConfirm}
          >
            Đóng
          </button>
        </div>
        <div className="modal-body">
          <p>
            Bạn có thể xem thông tin và kiểm tra lịch sân. Đăng nhập khi muốn
            giữ chỗ và quản lý lịch đặt.
          </p>
          <div className="guest-dialog-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                proceedAsGuest();
                onProceed?.();
              }}
            >
              Tiếp tục xem sân
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => openSignIn()}
            >
              Quay lại đăng nhập
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
