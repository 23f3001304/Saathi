import type { BlackoutHours, BlackoutWindow } from "@covenant/domain";

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const MINUTES_PER_DAY = 1440;

interface LocalTime {
  readonly dayStartUtcMs: number;
  readonly minuteOfDay: number;
  readonly offsetMs: number;
}

/**
 * Blackout hours are declared as local wall-clock times (`{tz, from, to}`,
 * §6.2) and the checks need instants, so the resolution happens once here and
 * `CooloffCheck` stays a pure comparison.
 *
 * The zone offset is sampled at `now` and applied to both edges. A window that
 * straddles a DST transition would therefore be off by the shift; the demo's
 * zone (`Asia/Kolkata`) has no DST, and a cooling-off boundary that moves by an
 * hour twice a year is a cost worth naming rather than a bug worth a tz library
 * outside the stack lock.
 */
export function activeBlackout(
  hours: BlackoutHours | null,
  now: Date,
): BlackoutWindow | null {
  if (hours === null) {
    return null;
  }
  const from = minutesOf(hours.from);
  const to = minutesOf(hours.to);
  const local = localTimeOf(now, hours.tz);
  if (from === null || to === null || !isInside(local.minuteOfDay, from, to)) {
    return null;
  }
  return windowFor(local, from, to);
}

function isInside(minute: number, from: number, to: number): boolean {
  return from < to
    ? minute >= from && minute < to
    : minute >= from || minute < to;
}

/** A wrapping window that `now` sits in the tail of started the previous day. */
function windowFor(
  local: LocalTime,
  from: number,
  to: number,
): BlackoutWindow {
  const wraps = from >= to;
  const inTail = wraps && local.minuteOfDay < to;
  const startDay = local.dayStartUtcMs - (inTail ? MS_PER_DAY : 0);
  const endDay = startDay + (wraps ? MS_PER_DAY : 0);
  return {
    starts_at: instantOf(startDay, from, local.offsetMs),
    ends_at: instantOf(endDay, to, local.offsetMs),
  };
}

function instantOf(dayStartUtcMs: number, minute: number, offsetMs: number): string {
  return new Date(
    dayStartUtcMs + minute * MS_PER_MINUTE - offsetMs,
  ).toISOString();
}

function minutesOf(clockTime: string): number | null {
  const parsed = /^(\d{2}):(\d{2})$/.exec(clockTime);
  if (parsed === null) {
    return null;
  }
  const hours = Number(parsed[1]);
  const minutes = Number(parsed[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

interface WallClock {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

function localTimeOf(now: Date, timeZone: string): LocalTime {
  const parts = partsOf(now, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
  const minuteOfDay = (parts.hour * 60 + parts.minute) % MINUTES_PER_DAY;
  const nowMinute = Math.floor(now.getTime() / MS_PER_MINUTE) * MS_PER_MINUTE;
  return {
    dayStartUtcMs: asUtc - minuteOfDay * MS_PER_MINUTE,
    minuteOfDay,
    offsetMs: asUtc - nowMinute,
  };
}

function partsOf(now: Date, timeZone: string): WallClock {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const found = new Map<string, number>();
  for (const part of formatter.formatToParts(now)) {
    found.set(part.type, Number(part.value));
  }
  return {
    year: found.get("year") ?? 1970,
    month: found.get("month") ?? 1,
    day: found.get("day") ?? 1,
    hour: found.get("hour") ?? 0,
    minute: found.get("minute") ?? 0,
  };
}
