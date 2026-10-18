import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { TransactionContext } from '../../../infrastructure/prisma/transaction-context.js';
import { Prisma } from '../../../generated/prisma/client.js';
import type { CourtSchedule } from '../application/court-schedule-reader.js';
import {
  PrismaCourtScheduleReader,
  toDomainPricingSchedule,
  toPublicCourtQuote,
} from './prisma-court-schedule-reader.js';

const clock = (time: string) => new Date(`1970-01-01T${time}:00Z`);
const instant = (time: string) => new Date(`2035-01-08T${time}:00+07:00`);
const timestamp = new Date('2020-01-01T00:00:00Z');

function schedule(): CourtSchedule {
  return {
    id: 'court-1',
    branchId: 'branch-1',
    cleanupMinutes: 15,
    branch: {
      timezone: 'Asia/Ho_Chi_Minh',
      businessHours: Array.from({ length: 7 }, (_, index) => ({
        id: String(index),
        branchId: 'branch-1',
        dayOfWeek: index + 1,
        openTime: clock('06:00'),
        closeTime: clock('23:00'),
        isClosed: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    },
    priceRules: [
      {
        id: 'base',
        courtId: 'court-1',
        startTime: clock('06:00'),
        endTime: clock('17:00'),
        pricePerHour: new Prisma.Decimal(100001),
        priority: 0,
        isActive: true,
        dayOfWeek: null,
        effectiveFrom: new Date('2020-01-01T00:00:00Z'),
        effectiveTo: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'peak',
        courtId: 'court-1',
        startTime: clock('17:00'),
        endTime: clock('23:00'),
        pricePerHour: new Prisma.Decimal(160003),
        priority: 0,
        isActive: true,
        dayOfWeek: null,
        effectiveFrom: new Date('2020-01-01T00:00:00Z'),
        effectiveTo: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  };
}

describe('PrismaCourtScheduleReader conversion boundary', () => {
  const reader = new PrismaCourtScheduleReader();

  it('converts Decimal rates to integer BigInt and Date clocks to minutes', () => {
    const domain = toDomainPricingSchedule(schedule());
    expect(domain.timezone).toBe('Asia/Ho_Chi_Minh');
    expect(domain.businessHours[0]).toMatchObject({
      dayOfWeek: 1,
      openMinute: 360,
      closeMinute: 1380,
      isClosed: false,
    });
    expect(domain.priceRules.map((rule) => rule.pricePerHour)).toEqual([
      100001n,
      160003n,
    ]);
    expect(domain.priceRules.map((rule) => rule.startTimeMinute)).toEqual([
      360, 1020,
    ]);
    expect(domain.priceRules[0].effectiveFromDate).toBe('2020-01-01');
  });

  it('keeps the public quote shape numeric with the same split amounts', () => {
    const quote = reader.quote(schedule(), instant('16:40'), instant('18:10'));
    expect(quote.totalAmount).toBe(220004);
    expect(quote.items.map((item) => item.amount)).toEqual([33334, 186670]);
    expect(quote.items.map((item) => typeof item.pricePerHour)).toEqual([
      'number',
      'number',
    ]);
    expect(quote.items.map((item) => typeof item.amount)).toEqual([
      'number',
      'number',
    ]);
  });

  it('maps CourtPricingError to the existing Booking 400 contract', () => {
    expect(() =>
      reader.quote(schedule(), instant('05:00'), instant('06:30')),
    ).toThrow(BadRequestException);
    expect(() =>
      reader.quote(schedule(), instant('05:00'), instant('06:30')),
    ).toThrow('Khoảng đặt nằm ngoài giờ hoạt động.');
  });

  it('returns a numeric public quote from the exported mapper', () => {
    const quote = toPublicCourtQuote({
      totalAmount: 220004,
      items: [
        {
          priceRuleId: 'base',
          startsAt: instant('16:40'),
          endsAt: instant('17:00'),
          durationMinutes: 20,
          pricePerHour: 100001n,
          amount: 33334,
        },
      ],
    });
    expect(quote.items[0].pricePerHour).toBe(100001);
    expect(typeof quote.items[0].pricePerHour).toBe('number');
  });

  it('reads the schedule through the caller transaction handle', async () => {
    const findFirst = jest.fn<() => Promise<unknown>>().mockResolvedValue(
      schedule(),
    );
    const transaction = {
      court: { findFirst },
    } as unknown as TransactionContext;
    const result = await reader.getActiveSchedule('court-1', transaction);
    expect(result.id).toBe('court-1');
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'court-1', status: 'ACTIVE', branch: { isActive: true } },
      include: {
        priceRules: true,
        branch: { include: { businessHours: true } },
      },
    });
  });

  it('throws the preserved 404 when the active schedule is missing', async () => {
    const findFirst = jest.fn<() => Promise<unknown>>().mockResolvedValue(null);
    const transaction = {
      court: { findFirst },
    } as unknown as TransactionContext;
    await expect(
      reader.getActiveSchedule('court-1', transaction),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
