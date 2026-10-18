import type { CourtStatus, CourtType } from '../../../../enums/index.js';
import type { CourtPricingSchedule } from '../../domain/court-pricing.types.js';

/**
 * Application read model for one active court. It deliberately omits Prisma
 * relations, private branch fields and pricing rules that the public catalog
 * must not expose.
 */
export interface ActiveCourtReadModel {
  id: string;
  name: string;
  code: string;
  courtType: CourtType;
  status: CourtStatus;
  cleanupMinutes: number;
  branchName: string;
  address: string;
  schedule: CourtPricingSchedule;
}

export interface ActiveCourtWithStartingPrice extends ActiveCourtReadModel {
  startingPrice: number;
}
