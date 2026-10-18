export type CourtType = 'VIP' | 'STANDARD';
export type CourtStatus = 'ACTIVE' | 'INACTIVE';

export interface CourtItem {
  timezone?: string;
  branchName?: string;
  address?: string;
  cleanupMinutes?: number;
  id: string;
  name: string;
  code: string;
  courtType: CourtType;
  status: CourtStatus;
  surfaceType: string;
  features: string[];
  pricePerHour: number;
  imageUrl: string;
  rating: number;
  reviewCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isCourtItem(value: unknown): value is CourtItem {
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
