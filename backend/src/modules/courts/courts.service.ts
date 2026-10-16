import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  applicableRules,
  localClock,
  quoteCourt,
  timeMinute,
} from './court-pricing.js';
import { BookingWindowDto } from '../bookings/dto/booking-request.dto.js';
import { databaseNow, expireHolds } from '../bookings/booking-lifecycle.js';
import {
  BOOKING_TRANSACTION_OPTIONS,
  HOLD_DURATION_MS,
  MINUTE_MS,
} from '../bookings/booking.constants.js';

const courtInclude = {
  priceRules: true,
  branch: { include: { businessHours: true } },
} satisfies Prisma.CourtInclude;
type ScheduledCourt = Prisma.CourtGetPayload<{ include: typeof courtInclude }>;

@Injectable()
export class CourtsService {
  constructor(private readonly prisma: PrismaService) {}

  async activeCourt(
    id: string,
    database: Prisma.TransactionClient = this.prisma,
  ) {
    const court = await database.court.findFirst({
      where: { id, status: 'ACTIVE', branch: { isActive: true } },
      include: courtInclude,
    });
    if (!court)
      throw new NotFoundException('Không tìm thấy sân đang hoạt động.');
    return court;
  }

  async getPublicCourts() {
    const courts = await this.prisma.court.findMany({
      where: { status: 'ACTIVE', branch: { isActive: true } },
      include: courtInclude,
      orderBy: { code: 'asc' },
    });
    return courts.map(presentCourt);
  }

  async getPublicCourt(id: string) {
    return presentCourt(await this.activeCourt(id));
  }

  async availability(id: string, window: BookingWindowDto) {
    return this.prisma.$transaction(async (transaction) => {
      const now = await databaseNow(transaction);
      await expireHolds(transaction, { courtId: id }, now);
      const court = await this.activeCourt(id, transaction);
      const startsAt = new Date(window.startsAt);
      const endsAt = new Date(window.endsAt);
      const quote = quoteCourt(court, startsAt, endsAt);
      const occupiedUntil = new Date(
        endsAt.getTime() + court.cleanupMinutes * MINUTE_MS,
      );
      const conflict = await hasOccupancyConflict(
        transaction,
        id,
        startsAt,
        occupiedUntil,
      );
      const tooSoon = startsAt.valueOf() - now.valueOf() < HOLD_DURATION_MS;
      return presentAvailability(
        court,
        quote,
        now,
        occupiedUntil,
        !!conflict,
        tooSoon,
      );
    }, BOOKING_TRANSACTION_OPTIONS);
  }
}

async function hasOccupancyConflict(
  transaction: Prisma.TransactionClient,
  courtId: string,
  startsAt: Date,
  occupiedUntil: Date,
) {
  return !!(await transaction.courtOccupancy.findFirst({
    where: {
      courtId,
      state: 'ACTIVE',
      occupiedFrom: { lt: occupiedUntil },
      occupiedUntil: { gt: startsAt },
    },
    select: { id: true },
  }));
}

function startingPrice(court: ScheduledCourt) {
  const local = localClock(new Date(), court.branch.timezone);
  const rules = applicableRules(court.priceRules, local.date, local.weekday);
  const opening = court.branch.businessHours.find(
    (hour) => hour.dayOfWeek === local.weekday,
  );
  if (!opening?.openTime || !opening.closeTime || opening.isClosed) return 0;
  const prices: number[] = [];
  for (
    let minute = timeMinute(opening.openTime);
    minute < timeMinute(opening.closeTime);
    minute++
  ) {
    const rule = rules.find(
      (item) =>
        timeMinute(item.startTime) <= minute &&
        timeMinute(item.endTime) > minute,
    );
    if (rule) prices.push(rule.pricePerHour.toNumber());
  }
  return prices.length ? Math.min(...prices) : 0;
}

function presentCourt(court: ScheduledCourt) {
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
    pricePerHour: startingPrice(court),
    priceLabel: 'Giá từ trong ngày; giá chính xác theo khoảng đặt',
    imageUrl:
      court.courtType === 'VIP' ? '/courts/court-1.jpg' : '/courts/court-3.jpg',
    rating: 0,
    reviewCount: 0,
    timezone: court.branch.timezone,
    branchName: court.branch.name,
    address: court.branch.address,
    cleanupMinutes: court.cleanupMinutes,
  };
}

function presentAvailability(
  court: ScheduledCourt,
  quote: ReturnType<typeof quoteCourt>,
  now: Date,
  occupiedUntil: Date,
  conflict: boolean,
  tooSoon: boolean,
) {
  return {
    available: !conflict && !tooSoon,
    reason: conflict
      ? 'Khoảng sân đã được giữ, bao gồm thời gian vệ sinh.'
      : tooSoon
        ? 'Giờ bắt đầu phải cách hiện tại ít nhất 5 phút.'
        : null,
    serverNow: now.toISOString(),
    timezone: court.branch.timezone,
    cleanupMinutes: court.cleanupMinutes,
    occupiedUntil: occupiedUntil.toISOString(),
    totalAmount: quote.totalAmount.toNumber(),
    currency: 'VND',
    priceItems: quote.items.map((item) => ({
      ...item,
      pricePerHour: item.pricePerHour.toNumber(),
      amount: item.amount.toNumber(),
    })),
  };
}
