import { Injectable } from '@nestjs/common';
import type { ActiveCourtWithStartingPrice } from '../application/models/court-read-models.js';
import { PublicCourtDto } from './dto/courts-response.dto.js';

const LEGACY_COURT_NAME_MAP: Readonly<Record<string, string>> = {
  'Center Court Pro 1': 'Demo Court VIP 1',
  'Championship Arena 2': 'Demo Court VIP 2',
  'Pickle Standard 3': 'Demo Court Standard 3',
  'Pickle Court 3': 'Demo Court Standard 3',
  'Dynamic Court 4': 'Demo Court Standard 4',
};

function normalizeCourtName(name: string): string {
  return LEGACY_COURT_NAME_MAP[name] ?? name;
}

/**
 * Maps the application read model to the public HTTP catalogue shape. The
 * response keys, labels and image conventions are preserved from the original
 * CourtsService presenter.
 */
@Injectable()
export class CourtResponsePresenter {
  present(court: ActiveCourtWithStartingPrice): PublicCourtDto {
    return {
      id: court.id,
      name: normalizeCourtName(court.name),
      code: court.code,
      courtType: court.courtType,
      status: court.status,
      surfaceType: '',
      features:
        court.cleanupMinutes > 0
          ? [`Vệ sinh ${court.cleanupMinutes} phút sau lượt chơi`]
          : [],
      pricePerHour: court.startingPrice,
      priceLabel: 'Giá từ trong ngày; giá chính xác theo khoảng đặt',
      imageUrl:
        court.courtType === 'VIP'
          ? '/courts/court-1.jpg'
          : '/courts/court-3.jpg',
      rating: 0,
      reviewCount: 0,
      timezone: court.schedule.timezone,
      // Public showcase must not reveal a previously seeded real venue.
      branchName: 'SMASH ARENA DEMO',
      address: 'SMASH ARENA DEMO',
      cleanupMinutes: court.cleanupMinutes,
    };
  }

  presentMany(courts: ActiveCourtWithStartingPrice[]): PublicCourtDto[] {
    return courts.map((court) => this.present(court));
  }
}
