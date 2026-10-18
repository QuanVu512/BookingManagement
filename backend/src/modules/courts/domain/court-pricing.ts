import {
  CourtPricingError,
  type CourtPricingSchedule,
  type DomainCourtQuote,
  type DomainPricingRule,
  type DomainQuoteItem,
} from './court-pricing.types.js';

const MILLISECONDS_PER_MINUTE = 60_000;

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
  rules: DomainPricingRule[],
  date: string,
  weekday: number,
) {
  return rules
    .filter(
      (rule) =>
        rule.isActive &&
        (rule.dayOfWeek === null || rule.dayOfWeek === weekday) &&
        rule.effectiveFromDate <= date &&
        (!rule.effectiveToDate || rule.effectiveToDate >= date),
    )
    .sort(
      (left, right) =>
        right.priority - left.priority || left.id.localeCompare(right.id),
    );
}

/**
 * HALF_UP rounding for non-negative integer VND.
 *
 * `NUMERIC(14,0)` caps a rate at 99_999_999_999_999 and a same-day window at
 * 1440 minutes, so the largest line amount is below 2.4e15, inside
 * `Number.MAX_SAFE_INTEGER`. BigInt keeps the intermediate product exact while
 * the result crosses back to Number only at this safe boundary.
 */
function lineAmount(rate: bigint, durationMinutes: number): bigint {
  if (rate <= 0n || durationMinutes <= 0) return 0n;
  return (rate * BigInt(durationMinutes) + 30n) / 60n;
}

function toVnd(amount: bigint): number {
  const value = Number(amount);
  if (!Number.isSafeInteger(value))
    throw new CourtPricingError(
      'INVALID_TOTAL_AMOUNT',
      'Khoảng đặt chưa có giá hợp lệ.',
    );
  return value;
}

export function calculateLineAmount(
  rate: bigint | number,
  durationMinutes: number,
): number {
  const hourlyRate = typeof rate === 'bigint' ? rate : BigInt(Math.trunc(rate));
  return toVnd(lineAmount(hourlyRate, durationMinutes));
}

function assertOpen(
  hours: CourtPricingSchedule['businessHours'],
  weekday: number,
  start: number,
  end: number,
) {
  const opening = hours.find((hour) => hour.dayOfWeek === weekday);
  if (
    !opening ||
    opening.isClosed ||
    opening.openMinute === null ||
    opening.closeMinute === null ||
    start < opening.openMinute ||
    end > opening.closeMinute
  )
    throw new CourtPricingError(
      'OUTSIDE_BUSINESS_HOURS',
      'Khoảng đặt nằm ngoài giờ hoạt động.',
    );
}

function priceSegments(
  rules: DomainPricingRule[],
  start: number,
  end: number,
) {
  const boundaries = [
    ...new Set([
      start,
      end,
      ...rules.flatMap((rule) => [rule.startTimeMinute, rule.endTimeMinute]),
    ]),
  ]
    .filter((minute) => minute >= start && minute <= end)
    .sort((left, right) => left - right);
  const segments: { start: number; end: number; rule: DomainPricingRule }[] = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const from = boundaries[index];
    const until = boundaries[index + 1];
    const rule = rules.find(
      (item) => item.startTimeMinute <= from && item.endTimeMinute >= until,
    );
    if (!rule)
      throw new CourtPricingError(
        'MISSING_PRICE',
        'Chưa có giá cho toàn bộ khoảng đặt.',
      );
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
    startsAt.getTime() % MILLISECONDS_PER_MINUTE ||
    endsAt.getTime() % MILLISECONDS_PER_MINUTE
  )
    throw new CourtPricingError(
      'INVALID_WINDOW',
      'Khoảng đặt phải hợp lệ và chính xác đến phút.',
    );
  const start = localClock(startsAt, timezone);
  const end = localClock(endsAt, timezone);
  if (
    start.date !== end.date ||
    end.minute <= start.minute ||
    endsAt.getTime() - startsAt.getTime() !==
      (end.minute - start.minute) * MILLISECONDS_PER_MINUTE
  )
    throw new CourtPricingError(
      'LOCAL_WINDOW_SPANS_DAYS',
      'Khoảng đặt phải nằm trong cùng ngày địa phương, không qua chuyển đổi DST.',
    );
  return { start, end };
}

function priceSnapshot(
  segment: { start: number; end: number; rule: DomainPricingRule },
  startsAt: Date,
  startMinute: number,
): DomainQuoteItem {
  const durationMinutes = segment.end - segment.start;
  return {
    priceRuleId: segment.rule.id,
    startsAt: new Date(
      startsAt.getTime() +
        (segment.start - startMinute) * MILLISECONDS_PER_MINUTE,
    ),
    endsAt: new Date(
      startsAt.getTime() +
        (segment.end - startMinute) * MILLISECONDS_PER_MINUTE,
    ),
    durationMinutes,
    pricePerHour: segment.rule.pricePerHour,
    amount: toVnd(lineAmount(segment.rule.pricePerHour, durationMinutes)),
  };
}

export function quoteCourt(
  court: CourtPricingSchedule,
  startsAt: Date,
  endsAt: Date,
): DomainCourtQuote {
  const { start, end } = validatedLocalWindow(
    startsAt,
    endsAt,
    court.timezone,
  );
  assertOpen(court.businessHours, start.weekday, start.minute, end.minute);
  const rules = applicableRules(court.priceRules, start.date, start.weekday);
  const items = priceSegments(rules, start.minute, end.minute).map((segment) =>
    priceSnapshot(segment, startsAt, start.minute),
  );
  const totalAmount = items.reduce((total, item) => total + item.amount, 0);
  if (totalAmount <= 0)
    throw new CourtPricingError(
      'INVALID_TOTAL_AMOUNT',
      'Khoảng đặt chưa có giá hợp lệ.',
    );
  return { items, totalAmount };
}

/**
 * Lowest hourly rate applicable today in the branch timezone.
 *
 * `now` is mandatory: the pure policy never reads the clock itself, so callers
 * in the application layer own the non-deterministic boundary.
 */
export function calculateStartingPrice(
  court: CourtPricingSchedule,
  now: Date,
): number {
  const local = localClock(now, court.timezone);
  const rules = applicableRules(court.priceRules, local.date, local.weekday);
  const opening = court.businessHours.find(
    (hour) => hour.dayOfWeek === local.weekday,
  );
  if (
    !opening ||
    opening.isClosed ||
    opening.openMinute === null ||
    opening.closeMinute === null
  )
    return 0;
  const prices: bigint[] = [];
  for (
    let minute = opening.openMinute;
    minute < opening.closeMinute;
    minute++
  ) {
    const rule = rules.find(
      (item) =>
        item.startTimeMinute <= minute && item.endTimeMinute > minute,
    );
    if (rule) prices.push(rule.pricePerHour);
  }
  if (!prices.length) return 0;
  const lowest = prices.reduce((left, right) =>
    left < right ? left : right,
  );
  // The schema caps a rate at 14 integer digits, well inside Number's safe
  // integer range, so the display value preserves the database value exactly.
  return Number(lowest);
}
