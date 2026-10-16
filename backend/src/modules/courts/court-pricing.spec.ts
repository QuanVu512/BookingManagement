import { describe, expect, it } from '@jest/globals';
import { Prisma } from '../../generated/prisma/client.js';
import { applicableRules, localClock, quoteCourt } from './court-pricing.js';

const instant = (time: string) => new Date(`2035-01-08T${time}:00+07:00`);
const clock = (time: string) => new Date(`1970-01-01T${time}:00Z`);
const timestamp = new Date('2020-01-01T00:00:00Z');
function rule(
  id: string,
  start: string,
  end: string,
  rate: number,
  priority = 0,
) {
  return {
    id,
    courtId: 'test',
    startTime: clock(start),
    endTime: clock(end),
    pricePerHour: new Prisma.Decimal(rate),
    priority,
    isActive: true,
    dayOfWeek: null,
    effectiveFrom: timestamp,
    effectiveTo: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
function court(
  priceRules = [
    rule('base', '06:00', '17:00', 100001),
    rule('peak', '17:00', '23:00', 160003),
  ],
) {
  return {
    priceRules,
    branch: {
      timezone: 'Asia/Ho_Chi_Minh',
      businessHours: Array.from({ length: 7 }, (_, index) => ({
        id: String(index),
        branchId: 'test',
        dayOfWeek: index + 1,
        openTime: clock('06:00'),
        closeTime: clock('23:00'),
        isClosed: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    },
  };
}
describe('Branch-local pricing with full coverage and VND line rounding', () => {
  it('splits 16:40–18:10 and sums independently rounded snapshot lines', () => {
    const quote = quoteCourt(court(), instant('16:40'), instant('18:10'));
    expect(
      quote.items.map((item) => [item.durationMinutes, item.amount.toNumber()]),
    ).toEqual([
      [20, 33334],
      [70, 186670],
    ]);
    expect(quote.totalAmount.toNumber()).toBe(220004);
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
    expect(quote.totalAmount.toNumber()).toBe(150002);
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
    const end = new Date('2035-01-08T00:00:00Z');
    expect(
      applicableRules(
        [
          { ...base, effectiveTo: end },
          { ...base, id: 'inactive', isActive: false },
          { ...base, id: 'weekday', dayOfWeek: 3 },
        ],
        '2035-01-08',
        1,
      ).map((item) => item.id),
    ).toEqual(['date']);
    expect(
      applicableRules([{ ...base, effectiveTo: end }], '2035-01-09', 2),
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
});
