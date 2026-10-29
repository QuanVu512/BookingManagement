export interface ParsedTimeWindow {
  startsAt: string;
  endsAt: string;
}

export type TimeParseResult =
  | { kind: 'window'; window: ParsedTimeWindow }
  | { kind: 'needs-duration'; dateLabel: string; timeLabel: string }
  | { kind: 'none' };

const VIETNAM_TIMEZONE = 'Asia/Ho_Chi_Minh';
const VIETNAM_OFFSET = '+07:00';

function vietnamDatePlus(days: number, now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: VIETNAM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(now.getTime() + days * 86_400_000));
  const part = (key: string) =>
    parts.find((value) => value.type === key)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function resolveDateLabel(
  message: string,
  now: Date,
): { date: string; label: string } | null {
  if (/(tối nay|toi nay|hôm nay|hom nay)/.test(message)) {
    return { date: vietnamDatePlus(0, now), label: 'hôm nay' };
  }
  if (/(tối mai|toi mai|ngày mai|ngay mai|\bmai\b)/.test(message)) {
    return { date: vietnamDatePlus(1, now), label: 'ngày mai' };
  }
  if (/(ngày kia|ngay kia|\bmốt\b|mot)/.test(message)) {
    return { date: vietnamDatePlus(2, now), label: 'ngày kia' };
  }
  return null;
}

function parseStartTime(
  message: string,
): { hour: number; minute: number } | null {
  const match = /(\d{1,2})\s*h(?:\s*(\d{1,2}))?/.exec(message);
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  if (hour > 23 || minute > 59) {
    return null;
  }
  return { hour, minute };
}

function parseDurationMinutes(message: string): number | null {
  const hourMatch = /(\d+(?:[.,]\d+)?)\s*(tiếng|tieng|giờ|gio)/.exec(message);
  if (hourMatch) {
    return Math.round(Number(hourMatch[1].replace(',', '.')) * 60);
  }
  const minuteMatch = /(\d+)\s*(phút|phut)/.exec(message);
  if (minuteMatch) {
    return Number(minuteMatch[1]);
  }
  return null;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Parses a Vietnamese time request such as "19h tối mai, chơi 2 tiếng".
 * Returns a concrete window when both start and duration are known,
 * `needs-duration` when only the start is known, and `none` otherwise.
 */
export function parseTimeRequest(
  message: string,
  now: Date = new Date(),
): TimeParseResult {
  const normalized = message.toLowerCase();
  const day = resolveDateLabel(normalized, now);
  const start = parseStartTime(normalized);
  if (!day || !start) {
    return { kind: 'none' };
  }
  const durationMinutes = parseDurationMinutes(normalized);
  const timeLabel = `${start.hour}h${start.minute > 0 ? `:${pad(start.minute)}` : ''}`;
  if (durationMinutes === null || durationMinutes <= 0) {
    return { kind: 'needs-duration', dateLabel: day.label, timeLabel };
  }
  const startsAt = `${day.date}T${pad(start.hour)}:${pad(start.minute)}:00${VIETNAM_OFFSET}`;
  const endsAt = new Date(
    Date.parse(startsAt) + durationMinutes * 60_000,
  ).toISOString();
  return { kind: 'window', window: { startsAt, endsAt } };
}
