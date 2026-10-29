import { Injectable } from '@nestjs/common';
import { ListActiveCourtsUseCase } from '../../../courts/application/list-active-courts.use-case.js';
import { QuoteAvailabilityUseCase } from '../../../bookings/application/quote-availability.use-case.js';
import type { CourtType } from '../../../../enums/index.js';
import { AI_MAX_COURTS_CHECKED } from '../../ai-assistant.constants.js';

export interface AvailabilitySearchInput {
  courtType?: CourtType;
  startsAt: string;
  endsAt: string;
}

export interface CourtSuggestion {
  courtId: string;
  courtName: string;
  courtType: CourtType;
  totalAmount: number;
  currency: string;
  available: boolean;
  deepLink: string;
  imageUrl: string;
}

export interface AvailabilityCoverage {
  totalActiveCourts: number;
  checkedCourtsCount: number;
  failedCourtsCount: number;
  availableCourtsCount: number;
}

export interface AvailabilitySearchResult {
  suggestions: CourtSuggestion[];
  coverage: AvailabilityCoverage;
}

function buildDeepLink(
  courtId: string,
  startsAt: string,
  endsAt: string,
): string {
  return (
    `/courts/${courtId}` +
    `?startsAt=${encodeURIComponent(startsAt)}` +
    `&endsAt=${encodeURIComponent(endsAt)}`
  );
}

function imageForCourtType(courtType: CourtType): string {
  return courtType === 'VIP' ? '/courts/court-1.jpg' : '/courts/court-3.jpg';
}

@Injectable()
export class SearchAvailabilityTool {
  constructor(
    private readonly activeCourts: ListActiveCourtsUseCase,
    private readonly quoteAvailability: QuoteAvailabilityUseCase,
  ) {}

  async execute(
    input: AvailabilitySearchInput,
  ): Promise<AvailabilitySearchResult> {
    if (!Number.isFinite(Date.parse(input.startsAt))) {
      throw new Error('INVALID_STARTS_AT');
    }
    if (!Number.isFinite(Date.parse(input.endsAt))) {
      throw new Error('INVALID_ENDS_AT');
    }
    if (Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
      throw new Error('INVALID_WINDOW');
    }
    const courts = await this.activeCourts.execute();
    const filtered = input.courtType
      ? courts.filter((court) => court.courtType === input.courtType)
      : courts;
    const checked = filtered.slice(0, AI_MAX_COURTS_CHECKED);
    const suggestions: CourtSuggestion[] = [];
    let failedCourtsCount = 0;
    for (const court of checked) {
      try {
        const quote = await this.quoteAvailability.execute({
          courtId: court.id,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        });
        if (quote.available) {
          suggestions.push({
            courtId: court.id,
            courtName: court.name,
            courtType: court.courtType,
            totalAmount: quote.totalAmount,
            currency: quote.currency,
            available: true,
            deepLink: buildDeepLink(court.id, input.startsAt, input.endsAt),
            imageUrl: imageForCourtType(court.courtType),
          });
        }
      } catch {
        failedCourtsCount += 1;
      }
    }
    return {
      suggestions,
      coverage: {
        totalActiveCourts: filtered.length,
        checkedCourtsCount: checked.length - failedCourtsCount,
        failedCourtsCount,
        availableCourtsCount: suggestions.length,
      },
    };
  }
}
