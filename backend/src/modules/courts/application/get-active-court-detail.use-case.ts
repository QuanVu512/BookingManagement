import { Injectable } from '@nestjs/common';
import { calculateStartingPrice } from '../domain/court-pricing.js';
import { CourtReader } from '../ports/court-reader.js';
import type { ActiveCourtWithStartingPrice } from './models/court-read-models.js';

@Injectable()
export class GetActiveCourtDetailUseCase {
  constructor(private readonly courts: CourtReader) {}

  async execute(
    courtId: string,
  ): Promise<ActiveCourtWithStartingPrice | null> {
    const now = new Date();
    const court = await this.courts.findActiveCourtById(courtId);
    return court
      ? {
          ...court,
          startingPrice: calculateStartingPrice(court.schedule, now),
        }
      : null;
  }
}
