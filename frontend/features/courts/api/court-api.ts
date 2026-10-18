import {
  API_BASE_URL,
  READ_REQUEST_TIMEOUT_MS,
} from '../../../constants/network';
import { isCourtItem, type CourtItem } from '../model/court';

const COURTS_PATH = '/api/courts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function loadCourtCatalog(
  signal: AbortSignal,
): Promise<CourtItem[]> {
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
  if (payload.success !== true || !payload.data.every(isCourtItem))
    throw new Error('Dữ liệu danh mục sân không hợp lệ.');
  return payload.data;
}

export async function loadCourtDetail(
  id: string,
  signal: AbortSignal,
): Promise<CourtItem> {
  const response = await fetch(
    `${API_BASE_URL}${COURTS_PATH}/${encodeURIComponent(id)}`,
    {
      cache: 'no-store',
      signal: AbortSignal.any([
        signal,
        AbortSignal.timeout(READ_REQUEST_TIMEOUT_MS),
      ]),
    },
  );
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? 'Không tìm thấy sân đang hoạt động.'
        : 'Không tải được thông tin sân.',
    );
  const payload: unknown = await response.json();
  if (
    !isRecord(payload) ||
    payload.success !== true ||
    !isCourtItem(payload.data)
  )
    throw new Error('Dữ liệu sân không hợp lệ.');
  return payload.data;
}
