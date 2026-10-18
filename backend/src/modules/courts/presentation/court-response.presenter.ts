import { Injectable } from '@nestjs/common';
import type { ActiveCourtWithStartingPrice } from '../application/models/court-read-models.js';
import { PublicCourtDto } from './dto/courts-response.dto.js';

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
      name: court.name,
      code: court.code,
      courtType: court.courtType,
      status: court.status,
      surfaceType:
        court.courtType === 'VIP'
          ? 'Sân Pickleball trong nhà Cushion Pro'
          : 'Sân Pickleball tiêu chuẩn',
      features: [`Vệ sinh ${court.cleanupMinutes} phút sau lượt chơi`],
      pricePerHour: court.startingPrice,
      priceLabel: 'Giá từ trong ngày; giá chính xác theo khoảng đặt',
      imageUrl:
        court.courtType === 'VIP' ? '/courts/court-1.jpg' : '/courts/court-3.jpg',
      rating: 0,
      reviewCount: 0,
      timezone: court.schedule.timezone,
      branchName: court.branchName,
      address: court.address,
      cleanupMinutes: court.cleanupMinutes,
    };
  }

  presentMany(courts: ActiveCourtWithStartingPrice[]): PublicCourtDto[] {
    return courts.map((court) => this.present(court));
  }
}
