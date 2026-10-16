'use client';
import { useEffect, useState } from 'react';
import type { CourtItem } from '../types/auth';
import { loadCourtDetail } from '../services/courts';

export function useCourtDetail(courtId: string) {
  const [court, setCourt] = useState<CourtItem>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setCourt(undefined);
    setIsLoading(true);
    setError('');
    loadCourtDetail(courtId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setCourt(result);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(courtErrorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [courtId, revision]);
  const retry = () => setRevision((current) => current + 1);
  return { court, isLoading, error, retry };
}

function courtErrorMessage(reason: unknown) {
  if (
    reason instanceof Error &&
    !(reason instanceof TypeError) &&
    !(reason instanceof DOMException)
  )
    return reason.message;
  return 'Không tải được thông tin sân. Vui lòng thử lại.';
}
