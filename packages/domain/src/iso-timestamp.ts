/** RFC 3339 UTC instant with millisecond precision, e.g. `2026-08-31T18:30:00.000Z`. */
export type IsoTimestamp = string;

const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export function isIsoTimestamp(value: string): boolean {
  return ISO_TIMESTAMP_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

export function toIsoTimestamp(instant: Date): IsoTimestamp {
  return instant.toISOString();
}

/** Ordering helper: ISO strings may carry different offsets, so parse first. */
export function isBefore(left: IsoTimestamp, right: IsoTimestamp): boolean {
  return Date.parse(left) < Date.parse(right);
}
