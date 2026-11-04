'use client';

import { useCallback, useState } from 'react';
import { ArenaDialog } from './arena-dialog';
import { ArenaIcon } from './arena-icon';

function VenueLocations() {
  return (
    <div className="arena-location-content">
      <div className="arena-map-preview">
        <ArenaIcon name="pin" width="40" height="40" />
        <strong>SMASH ARENA DEMO</strong>
      </div>
      <p>
        Địa chỉ mô phỏng phục vụ trình diễn công nghệ. Đang cập nhật địa chỉ
        chính thức.
      </p>
    </div>
  );
}

export function ArenaLocationButton({
  label = 'Thông tin cơ sở demo',
}: {
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        type="button"
        className="arena-button arena-location-trigger"
        onClick={() => setOpen(true)}
      >
        <ArenaIcon name="pin" />
        {label}
      </button>
      {open && (
        <ArenaDialog title="SMASH ARENA DEMO" onClose={close}>
          <VenueLocations />
        </ArenaDialog>
      )}
    </>
  );
}
