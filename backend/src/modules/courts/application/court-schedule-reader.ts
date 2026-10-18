import type { TransactionContext } from '../../../infrastructure/prisma/transaction-context.js';
import type {
  BranchBusinessHour,
  PriceRule,
} from '../../../generated/prisma/client.js';

export interface CourtSchedule {
  id: string;
  branchId: string;
  cleanupMinutes: number;
  branch: {
    timezone: string;
    businessHours: BranchBusinessHour[];
  };
  priceRules: PriceRule[];
}

export interface CourtQuoteItem {
  priceRuleId: string;
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  pricePerHour: number;
  amount: number;
}

export interface CourtQuote {
  items: CourtQuoteItem[];
  totalAmount: number;
}

/**
 * Public scheduling/pricing interface owned by Courts. The caller supplies the
 * existing transaction so reads stay consistent with its booking writes.
 */
export abstract class CourtScheduleReader {
  abstract getActiveSchedule(
    courtId: string,
    transaction: TransactionContext,
  ): Promise<CourtSchedule>;

  abstract quote(
    schedule: CourtSchedule,
    startsAt: Date,
    endsAt: Date,
  ): CourtQuote;
}
