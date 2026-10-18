import { describe, expect, it } from '@jest/globals';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  applicableRules,
  calculateLineAmount,
  calculateStartingPrice,
  localClock,
  quoteCourt,
} from './court-pricing.js';
import {
  CourtPricingError,
  type CourtPricingSchedule,
  type DomainPricingRule,
} from './court-pricing.types.js';

const instant = (time: string) => new Date(`2035-01-08T${time}:00+07:00`);

function minute(time: string) {
  const [hour, minutes] = time.split(':').map(Number);
  return hour * 60 + minutes;
}

function rule(
  id: string,
  start: string,
  end: string,
  rate: bigint | number,
  priority = 0,
  overrides: Partial<DomainPricingRule> = {},
): DomainPricingRule {
  return {
    id,
    startTimeMinute: minute(start),
    endTimeMinute: minute(end),
    pricePerHour:
      typeof rate === 'bigint' ? rate : BigInt(Math.trunc(rate)),
    priority,
    isActive: true,
    dayOfWeek: null,
    effectiveFromDate: '2020-01-01',
    effectiveToDate: null,
    ...overrides,
  };
}

function court(
  priceRules: DomainPricingRule[] = [
    rule('base', '06:00', '17:00', 100001),
    rule('peak', '17:00', '23:00', 160003),
  ],
): CourtPricingSchedule {
  return {
    timezone: 'Asia/Ho_Chi_Minh',
    businessHours: Array.from({ length: 7 }, (_, index) => ({
      dayOfWeek: index + 1,
      openMinute: minute('06:00'),
      closeMinute: minute('23:00'),
      isClosed: false,
    })),
    priceRules,
  };
}

function decimalAmount(rate: string, minutes: number) {
  return Number(
    new Prisma.Decimal(rate)
      .mul(minutes)
      .div(60)
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP),
  );
}

describe('Branch-local pricing with full coverage and VND line rounding', () => {
  it('splits 16:40–18:10 and sums independently rounded snapshot lines', () => {
    const quote = quoteCourt(court(), instant('16:40'), instant('18:10'));
    expect(
      quote.items.map((item) => [item.durationMinutes, item.amount]),
    ).toEqual([
      [20, 33334],
      [70, 186670],
    ]);
    expect(quote.totalAmount).toBe(220004);
    expect(quote.items.map((item) => item.pricePerHour)).toEqual([
      100001n,
      160003n,
    ]);
  });
  it('rejects a price gap instead of partially charging', () => {
    expect(() =>
      quoteCourt(
        court([rule('gap', '06:00', '17:00', 100000)]),
        instant('16:40'),
        instant('18:10'),
      ),
    ).toThrow('toàn bộ');
  });
  it('applies priority without splitting a winning rule at irrelevant boundaries', () => {
    const quote = quoteCourt(
      court([
        rule('high', '06:00', '23:00', 100001, 10),
        rule('low', '17:00', '18:00', 1),
      ]),
      instant('16:40'),
      instant('18:10'),
    );
    expect(quote.items).toHaveLength(1);
    expect(quote.items[0].priceRuleId).toBe('high');
    expect(quote.totalAmount).toBe(150002);
  });
  it('uses the local calendar day across UTC midnight', () => {
    expect(
      localClock(new Date('2035-01-07T23:10:00Z'), 'Asia/Ho_Chi_Minh'),
    ).toMatchObject({ date: '2035-01-08', minute: 370 });
    expect(
      quoteCourt(court(), instant('06:10'), instant('07:11')).items[0]
        .durationMinutes,
    ).toBe(61);
  });
  it('filters inactive, weekday and effective-date rules inclusively', () => {
    const base = rule('date', '06:00', '23:00', 100000);
    expect(
      applicableRules(
        [
          { ...base, effectiveToDate: '2035-01-08' },
          { ...base, id: 'inactive', isActive: false },
          { ...base, id: 'weekday', dayOfWeek: 3 },
        ],
        '2035-01-08',
        1,
      ).map((item) => item.id),
    ).toEqual(['date']);
    expect(
      applicableRules(
        [{ ...base, effectiveToDate: '2035-01-08' }],
        '2035-01-09',
        2,
      ),
    ).toHaveLength(0);
  });
  it.each([
    ['05:59', '07:00'],
    ['22:59', '23:01'],
    ['08:00', '08:00'],
  ])('rejects invalid operating window %s–%s', (start, end) => {
    expect(() => quoteCourt(court(), instant(start), instant(end))).toThrow();
  });
  it('does not charge free/unpriced periods or sub-minute requests', () => {
    expect(() =>
      quoteCourt(
        court([rule('free', '06:00', '23:00', 0)]),
        instant('08:00'),
        instant('09:00'),
      ),
    ).toThrow();
    expect(() =>
      quoteCourt(
        court(),
        new Date(instant('08:00').getTime() + 1000),
        instant('09:00'),
      ),
    ).toThrow();
  });
  it('exposes typed domain errors with the preserved public messages', () => {
    expect.assertions(6);
    try {
      quoteCourt(court([]), instant('08:00'), instant('09:00'));
    } catch (error) {
      expect(error).toBeInstanceOf(CourtPricingError);
      expect((error as CourtPricingError).code).toBe('MISSING_PRICE');
      expect((error as Error).message).toBe(
        'Chưa có giá cho toàn bộ khoảng đặt.',
      );
    }
    try {
      quoteCourt(court(), instant('05:00'), instant('06:30'));
    } catch (error) {
      expect(error).toBeInstanceOf(CourtPricingError);
      expect((error as CourtPricingError).code).toBe('OUTSIDE_BUSINESS_HOURS');
      expect((error as Error).message).toBe(
        'Khoảng đặt nằm ngoài giờ hoạt động.',
      );
    }
  });
});

describe('Exact VND HALF_UP arithmetic', () => {
  it.each([
    ['100001', 20],
    ['160003', 70],
    ['250000', 1440],
    ['1', 30],
    ['2', 15],
    ['3', 10],
    ['5', 6],
    ['99999999999', 91],
    ['99999999999999', 190],
    ['99999999999998', 195],
    ['50000000000001', 370],
    ['99999999999999', 1440],
  ])('matches Decimal HALF_UP for rate %s over %i minutes', (rate, minutes) => {
    expect(calculateLineAmount(BigInt(rate), minutes)).toBe(
      decimalAmount(rate, minutes),
    );
  });
  it('returns zero for non-positive rates or durations', () => {
    expect(calculateLineAmount(0n, 60)).toBe(0);
    expect(calculateLineAmount(100000, 0)).toBe(0);
    expect(calculateLineAmount(100000, -1)).toBe(0);
  });
});

describe('Starting price uses an explicit caller clock', () => {
  it('returns the lowest applicable rule over the local business day', () => {
    expect(calculateStartingPrice(court(), instant('16:40'))).toBe(100001);
  });
  it('returns zero on a closed day or when no rule covers any minute', () => {
    const closed = court();
    closed.businessHours = closed.businessHours.map((hour) => ({
      ...hour,
      isClosed: true,
    }));
    expect(calculateStartingPrice(closed, instant('16:40'))).toBe(0);
    expect(calculateStartingPrice(court([]), instant('16:40'))).toBe(0);
  });
  it('moves the local day with the timezone instead of reading the host clock', () => {
    const atUtcMidnight = new Date('2035-01-07T17:30:00Z');
    expect(
      localClock(atUtcMidnight, 'Asia/Ho_Chi_Minh').date,
    ).toBe('2035-01-08');
    expect(
      localClock(atUtcMidnight, 'America/New_York').date,
    ).toBe('2035-01-07');
  });
});
