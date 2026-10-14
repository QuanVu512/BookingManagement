import type { CourtItem } from '../types/auth';
import { FALLBACK_COURTS } from '../data/courts';
import { API_BASE_URL, READ_REQUEST_TIMEOUT_MS } from '../constants/network';

const COURTS_PATH = '/api/courts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCourtItem(value: unknown): value is CourtItem {
  if (!isRecord(value)) return false;
  return (
    ['id', 'name', 'code', 'surfaceType', 'imageUrl'].every(
      (key) => typeof value[key] === 'string',
    ) &&
    (value.courtType === 'VIP' || value.courtType === 'STANDARD') &&
    (value.status === 'ACTIVE' || value.status === 'INACTIVE') &&
    Array.isArray(value.features) &&
    value.features.every((feature) => typeof feature === 'string') &&
    typeof value.pricePerHour === 'number' &&
    Number.isFinite(value.pricePerHour) &&
    value.pricePerHour >= 0 &&
    typeof value.rating === 'number' &&
    typeof value.reviewCount === 'number'
  );
}

export async function loadCourtCatalog(
  signal: AbortSignal,
): Promise<CourtItem[]> {
  try {
    return await fetchCourtCatalog(signal);
  } catch (error: unknown) {
    if (signal.aborted) throw error;
    console.info('Danh mục sân đang dùng dữ liệu dự phòng.');
    return FALLBACK_COURTS;
  }
}

async function fetchCourtCatalog(signal: AbortSignal): Promise<CourtItem[]> {
  const response = await fetch(`${API_BASE_URL}${COURTS_PATH}`, {
    signal: AbortSignal.any([
      signal,
      AbortSignal.timeout(READ_REQUEST_TIMEOUT_MS),
    ]),
  });
  if (!response.ok) throw new Error('Không tải được danh mục sân.');
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.data))
    throw new Error('Dữ liệu danh mục sân không hợp lệ.');
  const courts = payload.data.filter(isCourtItem);
  return courts.length ? courts : FALLBACK_COURTS;
}
