// Persistence entities are generated from schema.prisma, not API response DTOs.
// Run npm run prisma:generate before consuming these types.
export type {
  Booking as BookingEntity,
  CourtOccupancy as CourtOccupancyEntity,
  BookingPriceItem as BookingPriceItemEntity,
  BookingStatusHistory as BookingStatusHistoryEntity,
  BookingAccessToken as BookingAccessTokenEntity,
  BookingCancellationRequest as BookingCancellationRequestEntity,
} from '../../generated/prisma/client.js';
