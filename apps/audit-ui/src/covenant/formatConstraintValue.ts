import type { Constraint } from "../api/types.ts";
import { paise } from "../primitives/formatMoney.ts";

/**
 * An amendment arrives from `Field` as a raw string (§2.2 D9 — inert until
 * sealed), so this coerces regardless of whether `value` is still the
 * original number or a just-typed numeric string. Shared by `ConstraintRow`
 * and the `SigningSheet` seal-amendments summary so they never disagree.
 */
const BY_UNIT: Record<string, (value: unknown) => string> = {
  paise: (value) => paise(Number(value)),
  percent: (value) => `${Number(value).toFixed(1)}%`,
  window: (value) => hours(Number(value)),
  time: (value) => instant(String(value)),
};

export function formatConstraintValue(constraint: Constraint): string {
  const { value, unit } = constraint;
  const byUnit = unit === undefined ? undefined : BY_UNIT[unit];
  if (byUnit !== undefined) return byUnit(value);
  // Booleans read as answers, not as JavaScript.
  if (value === true || value === "true") return "Yes";
  if (value === false || value === "false") return "No";
  return String(value);
}

/** A cool-off is quoted in whole hours, or in days once it passes two. */
function hours(count: number): string {
  if (!Number.isFinite(count)) return "—";
  if (count >= 48) return `${Math.round(count / 24)} days`;
  return `${count} hour${count === 1 ? "" : "s"}`;
}

/** An expiry is a moment, not an ISO string; the raw form stays in the title. */
function instant(raw: string): string {
  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) return raw;
  return at.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
