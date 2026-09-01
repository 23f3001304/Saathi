import type { EnvelopePeriod, IsoTimestamp } from "@covenant/domain";

const MS_PER_DAY = 86_400_000;

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function dayKey(instant: Date): string {
  return `${instant.getUTCFullYear()}-${pad(instant.getUTCMonth() + 1)}-${pad(instant.getUTCDate())}`;
}

/** UTC midnight of the ISO week's Monday — a date, so the key stays sortable. */
function weekStart(instant: Date): Date {
  const midnight = Date.UTC(
    instant.getUTCFullYear(),
    instant.getUTCMonth(),
    instant.getUTCDate(),
  );
  const isoDayIndex = (instant.getUTCDay() + 6) % 7;
  return new Date(midnight - isoDayIndex * MS_PER_DAY);
}

/**
 * The envelope's bucket (§3.8 `period_key`). Buckets are UTC: a rolling cap
 * needs one unambiguous boundary shared by the check, the reservation row and
 * the burn-down bar, and the user's local midnight is not available to the
 * sweeper.
 */
export function periodKeyOf(period: EnvelopePeriod, now: Date): string {
  switch (period) {
    case "day":
      return dayKey(now);
    case "week":
      return `${dayKey(weekStart(now))}/w`;
    case "month":
      return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;
  }
}

export function periodResetsAt(
  period: EnvelopePeriod,
  now: Date,
): IsoTimestamp {
  switch (period) {
    case "day":
      return isoOf(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
      );
    case "week":
      return isoOf(weekStart(now).getTime() + 7 * MS_PER_DAY);
    case "month":
      return isoOf(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  }
}

function isoOf(epochMs: number): IsoTimestamp {
  return new Date(epochMs).toISOString();
}
