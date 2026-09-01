// A change to the covenant that somebody has proposed and nobody has signed.
//
// DECISION: `ProposedChange` has no `direction` field, and there is nowhere to
// put one. Whether a change narrows or widens is a function of the values, and
// the screen computes it every time it draws — so a proposal that arrives over
// the wire calling itself a tightening while raising a ceiling is simply not
// believed, because there is no field in which it could have said so. The same
// table lives in `packages/agents`; the app takes no dependency on the backend
// packages, and a direction the UI could only get by asking the backend would
// be a direction the UI is trusting rather than deriving.
import { paise } from "../primitives/formatMoney.ts";

export type AmendmentDirection = "narrows" | "widens";

export type AmendmentValue = number | boolean;

export type ProposedChange = {
  rule: string;
  /** The category, merchant or product the rule is about; null if global. */
  scope: string | null;
  from: AmendmentValue | null;
  to: AmendmentValue;
  unit: string | null;
  currency: string | null;
};

export type PendingAmendment = {
  id: string;
  summary: string;
  changes: ProposedChange[];
  proposedAt: string;
};

const WIDENED_BY_LOWER = new Set(["hold_seconds"]);

const WIDENED_BY_HIGHER = new Set([
  "max_amount",
  "cap_paise",
  "max_apr_bps",
  // Cool-off applies above the threshold, so raising it exempts more
  // purchases from the wait.
  "threshold_paise",
]);

/** Rules where letting the agent do more means `true`. */
const PERMISSIVE_WHEN_TRUE = new Set([
  "allow_credit",
  "share_aggregates",
  "merchant",
  "sku",
  "category",
]);

const PERMISSIVE_WHEN_FALSE = new Set([
  "requires_refundability",
  "user_cart_confirmation_required",
  "human_present",
]);

function flagDirection(
  rule: string,
  to: AmendmentValue,
): AmendmentDirection | null {
  if (PERMISSIVE_WHEN_TRUE.has(rule)) return to === true ? "widens" : "narrows";
  if (PERMISSIVE_WHEN_FALSE.has(rule)) {
    return to === false ? "widens" : "narrows";
  }
  return null;
}

/** A bound that did not exist before can only take room away. */
function numberDirection(
  rule: string,
  from: AmendmentValue | null,
  to: number,
): AmendmentDirection {
  if (typeof from !== "number") return "narrows";
  const wider = WIDENED_BY_LOWER.has(rule) ? to < from : to > from;
  return wider ? "widens" : "narrows";
}

/** An unrecognised rule reads as a widening. Fail closed. */
export function directionOf(change: ProposedChange): AmendmentDirection {
  const flag = flagDirection(change.rule, change.to);
  if (flag !== null) return flag;
  if (typeof change.to !== "number") return "widens";
  const known =
    WIDENED_BY_HIGHER.has(change.rule) || WIDENED_BY_LOWER.has(change.rule);
  return known
    ? numberDirection(change.rule, change.from, change.to)
    : "widens";
}

export function widens(amendment: PendingAmendment): boolean {
  return amendment.changes.some((c) => directionOf(c) === "widens");
}

const LABELS: Record<string, string> = {
  max_amount: "Single-purchase ceiling",
  cap_paise: "budget",
  max_apr_bps: "Credit APR ceiling",
  threshold_paise: "Cool-off above",
  hold_seconds: "Cool-off wait",
  requires_refundability: "Refundability required",
  allow_credit: "Credit allowed",
  user_cart_confirmation_required: "Confirm every cart",
  human_present: "Human present required",
  share_aggregates: "Share anonymised aggregates",
  merchant: "Merchant",
  sku: "Product",
  category: "Category",
};

export function labelOf(change: ProposedChange): string {
  const base = LABELS[change.rule] ?? change.rule.replace(/_/g, " ");
  if (change.scope === null) return base;
  return change.rule === "cap_paise"
    ? `${change.scope} ${base}`
    : `${base} ${change.scope}`;
}

function hours(count: number): string {
  if (count >= 48) return `${Math.round(count / 24)} days`;
  return `${count} hour${count === 1 ? "" : "s"}`;
}

function numberText(change: ProposedChange, value: number): string {
  if (change.unit === "paise") return paise(value);
  if (change.unit === "bps") return `${(value / 100).toFixed(1)}%`;
  if (change.unit === "seconds") return hours(Math.round(value / 3600));
  return String(value);
}

const MEMBERSHIP = new Set(["merchant", "sku", "category"]);

export function valueText(
  change: ProposedChange,
  value: AmendmentValue | null,
): string {
  if (value === null) return "not set";
  if (typeof value === "number") return numberText(change, value);
  if (MEMBERSHIP.has(change.rule)) return value ? "allowed" : "never";
  return value ? "yes" : "no";
}

export function changeText(change: ProposedChange): string {
  return `${valueText(change, change.from)} → ${valueText(change, change.to)}`;
}

/** The bill the signing sheet reads, in the same shape the Rules screen uses. */
export function amendmentLines(
  amendment: PendingAmendment,
): Array<{ label: string; value: string }> {
  return amendment.changes.map((change) => ({
    label: labelOf(change),
    value: changeText(change),
  }));
}
