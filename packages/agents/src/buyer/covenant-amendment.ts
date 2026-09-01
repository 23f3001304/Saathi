import type { ConstraintDirection } from "@covenant/domain";
import { constraintDirectionOf } from "@covenant/domain";

/** Whether a change gives the agent more room or less. Always computed. */
export type AmendmentDirection = "narrows" | "widens";

export type AmendmentValue = number | boolean;

export type AmendmentKind = "scalar" | "flag" | "membership";

/** Which way a number has to move to give the agent more room. */
export type WidenedBy = "higher" | "lower" | null;

export interface AmendableRule {
  readonly kind: AmendmentKind;
  /** The unit the covenant states this rule in; the model never picks it. */
  readonly unit: string | null;
  readonly currency: boolean;
  /** Membership axes and per-category caps name what they are about. */
  readonly scopeRequired: boolean;
  /** For a flag, the value that lets the agent do more; `null` otherwise. */
  readonly permissive: boolean | null;
  readonly widenedBy: WidenedBy;
}

function scalar(
  widenedBy: WidenedBy,
  unit: string,
  currency: boolean,
  scopeRequired = false,
): AmendableRule {
  return {
    kind: "scalar",
    unit,
    currency,
    scopeRequired,
    permissive: null,
    widenedBy,
  };
}

function flag(permissive: boolean): AmendableRule {
  return {
    kind: "flag",
    unit: "boolean",
    currency: false,
    scopeRequired: false,
    permissive,
    widenedBy: null,
  };
}

function membership(): AmendableRule {
  return {
    kind: "membership",
    unit: "member",
    currency: false,
    scopeRequired: true,
    permissive: null,
    widenedBy: null,
  };
}

/**
 * The vocabulary a sentence in the chat may reach. The keys are `domain`'s
 * canonical constraint predicates, not names invented here — a rule filed
 * under a name this table does not know is a rule nothing defends, and
 * `parseAmendment` rejects it rather than guessing.
 */
export const AMENDABLE_RULES: Readonly<Record<string, AmendableRule>> = {
  max_amount: scalar("higher", "paise", true),
  cap_paise: scalar("higher", "paise", true, true),
  max_apr_bps: scalar("higher", "bps", false),
  // DECISION: `threshold_paise` is the one key where this table does not agree
  // with `domain`'s `FLOOR_PREDICATES`, and the disagreement is deliberate.
  // Cool-off applies *above* the threshold, so raising it exempts more
  // purchases from the wait — ₹5,000 to ₹50,000 buys a ₹40,000 thing with no
  // hold at all. R1 reads the same key the other way; the two are answering
  // different questions (may an unsigned write land, versus which way does a
  // signed change point), and the answer this one gives is the one a person
  // reading "widens what I may do" is entitled to. `amendment-axes.test.ts`
  // pins the agreement on every other key so neither table can drift.
  threshold_paise: scalar("higher", "paise", true),
  hold_seconds: scalar("lower", "seconds", false),
  requires_refundability: flag(false),
  allow_credit: flag(true),
  user_cart_confirmation_required: flag(false),
  human_present: flag(false),
  share_aggregates: flag(true),
  merchant: membership(),
  sku: membership(),
  category: membership(),
};

export interface AmendmentChange {
  readonly rule: string;
  /** The category, merchant or product the rule is about; `null` if global. */
  readonly scope: string | null;
  /** What the covenant holds now; `null` when the rule does not exist yet. */
  readonly from: AmendmentValue | null;
  readonly to: AmendmentValue;
  readonly unit: string | null;
  readonly currency: string | null;
  readonly direction: AmendmentDirection;
}

export interface ProposedAmendment {
  readonly summary: string;
  readonly changes: readonly AmendmentChange[];
}

/**
 * A bound that did not exist before narrows: a cool-off where there was none
 * can only take room away.
 */
function numericDirection(
  shape: AmendableRule,
  from: number | null,
  to: number,
): AmendmentDirection {
  if (from === null) {
    return "narrows";
  }
  const wider = shape.widenedBy === "lower" ? to < from : to > from;
  return wider ? "widens" : "narrows";
}

/**
 * DECISION: direction is derived from the values and from nothing else. The
 * model is never asked which way its own change points and is not believed if
 * it says — a proposal that raises a ceiling while calling itself a tightening
 * is exactly the shape an attack takes, and the only defence that survives a
 * persuasive sentence is arithmetic.
 *
 * An unrecognised rule reads as `widens`. Fail closed: the harsher reading
 * costs a signature that was going to be asked for anyway.
 */
export function directionOf(
  rule: string,
  from: AmendmentValue | null,
  to: AmendmentValue,
): AmendmentDirection {
  const shape = AMENDABLE_RULES[rule];
  if (shape === undefined) {
    return "widens";
  }
  if (shape.kind === "membership") {
    return to === true ? "widens" : "narrows";
  }
  if (shape.kind === "flag") {
    return to === shape.permissive ? "widens" : "narrows";
  }
  if (typeof to !== "number") {
    return "widens";
  }
  return numericDirection(shape, typeof from === "number" ? from : null, to);
}

/**
 * The axis `domain` files each scalar rule under, as this table states it.
 * Exported so the agreement can be asserted rather than assumed.
 */
export function axisOf(rule: string): ConstraintDirection | null {
  const widenedBy = AMENDABLE_RULES[rule]?.widenedBy ?? null;
  if (widenedBy === null) {
    return null;
  }
  return widenedBy === "higher" ? "ceiling" : "floor";
}

export { constraintDirectionOf };

/** True when any part of the amendment gives the agent more room than it has. */
export function widensAnything(amendment: ProposedAmendment): boolean {
  return amendment.changes.some((change) => change.direction === "widens");
}

/** The rule names and units, for the tool description. One source, no drift. */
export function amendableVocabulary(): string {
  return Object.entries(AMENDABLE_RULES)
    .map(([rule, shape]) => `${rule} (${shape.unit ?? shape.kind})`)
    .join(", ");
}
