import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { TransactionContext } from '../../../infrastructure/prisma/transaction-context.js';
import {
  CourtScheduleReader,
  type CourtQuote,
  type CourtSchedule,
} from '../application/court-schedule-reader.js';
import {
  CourtPricingError,
  type CourtPricingSchedule,
  type DomainCourtQuote,
} from '../domain/court-pricing.types.js';
import { quoteCourt, timeMinute } from '../domain/court-pricing.js';
import { courtInclude } from './court-include.js';

/**
 * Converts the persistence-facing public schedule into the pure domain shape.
 * Decimal rates cross the boundary once, as integer BigInt VND; callers never
 * see Prisma types or call `.toNumber()` on a value the domain already parsed.
 */
export function toDomainPricingSchedule(
  schedule: Pick<CourtSchedule, 'branch' | 'priceRules'>,
): CourtPricingSchedule {
  return {
    timezone: schedule.branch.timezone,
    businessHours: schedule.branch.businessHours.map((hour) => ({
      dayOfWeek: hour.dayOfWeek,
      openMinute: hour.openTime ? timeMinute(hour.openTime) : null,
      closeMinute: hour.closeTime ? timeMinute(hour.closeTime) : null,
      isClosed: hour.isClosed,
    })),
    priceRules: schedule.priceRules.map((rule) => ({
      id: rule.id,
      startTimeMinute: timeMinute(rule.startTime),
      endTimeMinute: timeMinute(rule.endTime),
      pricePerHour: BigInt(rule.pricePerHour.toString()),
      priority: rule.priority,
      isActive: rule.isActive,
      dayOfWeek: rule.dayOfWeek,
      effectiveFromDate: rule.effectiveFrom.toISOString().slice(0, 10),
      effectiveToDate: rule.effectiveTo
        ? rule.effectiveTo.toISOString().slice(0, 10)
        : null,
    })),
  };
}

/** Maps the pure domain quote back to the existing public `CourtQuote` shape. */
export function toPublicCourtQuote(domainQuote: DomainCourtQuote): CourtQuote {
  return {
    totalAmount: domainQuote.totalAmount,
    items: domainQuote.items.map((item) => ({
      priceRuleId: item.priceRuleId,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      durationMinutes: item.durationMinutes,
      pricePerHour: Number(item.pricePerHour),
      amount: item.amount,
    })),
  };
}

@Injectable()
export class PrismaCourtScheduleReader extends CourtScheduleReader {
  async getActiveSchedule(
    courtId: string,
    transaction: TransactionContext,
  ): Promise<CourtSchedule> {
    const court = await transaction.court.findFirst({
      where: { id: courtId, status: 'ACTIVE', branch: { isActive: true } },
      include: courtInclude,
    });
    if (!court)
      throw new NotFoundException('Không tìm thấy sân đang hoạt động.');
    return court;
  }

  quote(schedule: CourtSchedule, startsAt: Date, endsAt: Date): CourtQuote {
    try {
      return toPublicCourtQuote(
        quoteCourt(toDomainPricingSchedule(schedule), startsAt, endsAt),
      );
    } catch (error) {
      if (error instanceof CourtPricingError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }
}
