import { Injectable } from '@nestjs/common';
import { calculateStartingPrice } from '../domain/court-pricing.js';
import { CourtReader } from '../ports/court-reader.js';
import type { ActiveCourtWithStartingPrice } from './models/court-read-models.js';

@Injectable()
export class ListActiveCourtsUseCase {
  constructor(private readonly courts: CourtReader) {}

  async execute(): Promise<ActiveCourtWithStartingPrice[]> {
    const now = new Date();
    const courts = await this.courts.findActiveCourts();
    return courts.map((court) => ({
      ...court,
      startingPrice: calculateStartingPrice(court.schedule, now),
    }));
  }
}
