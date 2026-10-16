import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type {
  BranchBusinessHour,
  PriceRule,
} from '../../generated/prisma/client.js';
import { MINUTE_MS } from '../bookings/booking.constants.js';

export function localClock(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (name: string) =>
    parts.find((entry) => entry.type === name)?.value ?? '';
  const date = `${part('year')}-${part('month')}-${part('day')}`;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
  return {
    date,
    weekday,
    minute: Number(part('hour')) * 60 + Number(part('minute')),
  };
}

export function timeMinute(time: Date) {
  return time.getUTCHours() * 60 + time.getUTCMinutes();
}

export function applicableRules(
  rules: PriceRule[],
  date: string,
  weekday: number,
) {
  return rules
    .filter(
      (rule) =>
        rule.isActive &&
        (rule.dayOfWeek === null || rule.dayOfWeek === weekday) &&
        rule.effectiveFrom.toISOString().slice(0, 10) <= date &&
        (!rule.effectiveTo ||
          rule.effectiveTo.toISOString().slice(0, 10) >= date),
    )
    .sort(
      (left, right) =>
        right.priority - left.priority || left.id.localeCompare(right.id),
    );
}

function assertOpen(
  hours: BranchBusinessHour[],
  weekday: number,
  start: number,
  end: number,
) {
  const opening = hours.find((hour) => hour.dayOfWeek === weekday);
  if (
    !opening ||
    opening.isClosed ||
    !opening.openTime ||
    !opening.closeTime ||
    start < timeMinute(opening.openTime) ||
    end > timeMinute(opening.closeTime)
  )
    throw new BadRequestException('Khoảng đặt nằm ngoài giờ hoạt động.');
}

function priceSegments(rules: PriceRule[], start: number, end: number) {
  const boundaries = [
    ...new Set([
      start,
      end,
      ...rules.flatMap((rule) => [
        timeMinute(rule.startTime),
        timeMinute(rule.endTime),
      ]),
    ]),
  ]
    .filter((minute) => minute >= start && minute <= end)
    .sort((left, right) => left - right);
  const segments: { start: number; end: number; rule: PriceRule }[] = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const from = boundaries[index];
    const until = boundaries[index + 1];
    const rule = rules.find(
      (item) =>
        timeMinute(item.startTime) <= from && timeMinute(item.endTime) >= until,
    );
    if (!rule)
      throw new BadRequestException('Chưa có giá cho toàn bộ khoảng đặt.');
    const previous = segments.at(-1);
    if (previous?.rule.id === rule.id) previous.end = until;
    else segments.push({ start: from, end: until, rule });
  }
  return segments;
}

function validatedLocalWindow(startsAt: Date, endsAt: Date, timezone: string) {
  if (
    !Number.isFinite(startsAt.getTime()) ||
    !Number.isFinite(endsAt.getTime()) ||
    endsAt <= startsAt ||
    startsAt.getTime() % MINUTE_MS ||
    endsAt.getTime() % MINUTE_MS
  )
    throw new BadRequestException(
      'Khoảng đặt phải hợp lệ và chính xác đến phút.',
    );
  const start = localClock(startsAt, timezone);
  const end = localClock(endsAt, timezone);
  if (
    start.date !== end.date ||
    end.minute <= start.minute ||
    endsAt.getTime() - startsAt.getTime() !==
      (end.minute - start.minute) * MINUTE_MS
  )
    throw new BadRequestException(
      'Khoảng đặt phải nằm trong cùng ngày địa phương, không qua chuyển đổi DST.',
    );
  return { start, end };
}

function priceSnapshot(
  segment: { start: number; end: number; rule: PriceRule },
  startsAt: Date,
  startMinute: number,
) {
  return {
    priceRuleId: segment.rule.id,
    startsAt: new Date(
      startsAt.getTime() + (segment.start - startMinute) * MINUTE_MS,
    ),
    endsAt: new Date(
      startsAt.getTime() + (segment.end - startMinute) * MINUTE_MS,
    ),
    durationMinutes: segment.end - segment.start,
    pricePerHour: segment.rule.pricePerHour,
    amount: segment.rule.pricePerHour
      .mul(segment.end - segment.start)
      .div(60)
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP),
  };
}

export function quoteCourt(
  court: {
    branch: { timezone: string; businessHours: BranchBusinessHour[] };
    priceRules: PriceRule[];
  },
  startsAt: Date,
  endsAt: Date,
) {
  const { start, end } = validatedLocalWindow(
    startsAt,
    endsAt,
    court.branch.timezone,
  );
  assertOpen(
    court.branch.businessHours,
    start.weekday,
    start.minute,
    end.minute,
  );
  const rules = applicableRules(court.priceRules, start.date, start.weekday);
  const items = priceSegments(rules, start.minute, end.minute).map((segment) =>
    priceSnapshot(segment, startsAt, start.minute),
  );
  const totalAmount = items.reduce(
    (total, item) => total.add(item.amount),
    new Prisma.Decimal(0),
  );
  if (totalAmount.lte(0))
    throw new BadRequestException('Khoảng đặt chưa có giá hợp lệ.');
  return { items, totalAmount };
}
