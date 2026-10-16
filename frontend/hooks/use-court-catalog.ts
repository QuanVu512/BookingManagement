'use client';
import { useEffect, useState } from 'react';
import type { CourtItem } from '../types/auth';
import { loadCourtCatalog } from '../services/courts';

export function useCourtCatalog() {
  const [courts, setCourts] = useState<CourtItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    loadCourtCatalog(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setCourts(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setCourts([]);
          setError('Không tải được danh mục sân. Vui lòng thử lại.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  const retry = () => setRevision((current) => current + 1);
  return { courts, error, loading, retry };
}
