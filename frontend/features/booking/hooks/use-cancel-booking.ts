'use client';
import { useEffect, useRef, useState } from 'react';
import { cancelBooking } from '../api/booking-service';

interface CancelFeed {
  reload: () => Promise<void>;
  fail: (message: string) => void;
  beginRevision: () => number;
  isCurrent: (revision: number) => boolean;
  isActive: () => boolean;
}

export function useCancelBooking(feed: CancelFeed, accountId?: string) {
  const [pendingId, setPendingId] = useState('');
  const locked = useRef(false);
  useEffect(() => setPendingId(''), [accountId]);
  const cancel = async (id: string) => {
    if (locked.current) return;
    locked.current = true;
    setPendingId(id);
    const revision = feed.beginRevision();
    try {
      await cancelBooking(id);
      if (feed.isActive()) await feed.reload();
    } catch (reason: unknown) {
      if (feed.isCurrent(revision))
        feed.fail(
          reason instanceof Error
            ? reason.message
            : 'Chưa xác nhận được kết quả hủy. Hãy tải lại.',
        );
    } finally {
      locked.current = false;
      if (feed.isActive()) setPendingId('');
    }
  };
  return { pendingId, cancel };
}
