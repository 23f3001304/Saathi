import type { IntentBounds } from "./intent-bounds.js";
import type { MemoryContent } from "./memory-entry.js";

/**
 * The canonical constraint vocabulary: the predicate names a signed bound is
 * **filed** under and the names R1/R2/R5 **compare** against, stated once.
 *
 * DECISION: this table lives in `domain` rather than in `memory` (with the
 * rules) or in `gateway-svc` (with `POST /covenant/sign`). Why: those two are
 * the only writers and readers of a constraint, they share nothing but
 * `domain`, and a second copy of the list is exactly the defect this module
 * closes — the route filed bounds under their §6.2 credential keys
 * (`allowance`, `cooloff`, `envelopes`, `merchants`, `skus`) while the rules
 * keyed on the scalars nested inside them (`max_amount`, `hold_seconds`,
 * `threshold_paise`, `merchant`, `sku`, `category`), so three of the five
 * rules could never fire against a covenant signed through the real route.
 * `TierPermissionRule` already takes its tier tables from here for the same
 * reason: a rule is a policy statement, never a second copy of the numbers.
 */

export type ConstraintDirection = "ceiling" | "floor" | "blackout_end";

/** A bound is widened by a HIGHER ceiling. */
export const CEILING_PREDICATES = [
  "max_amount",
  "max_amount_paise",
  "cap_paise",
  "category_cap",
  "max_apr_bps",
] as const;

/** A bound is widened by a LOWER floor. */
export const FLOOR_PREDICATES = ["hold_seconds", "threshold_paise"] as const;

/** A bound is widened by a LATER end instant. */
export const BLACKOUT_END_PREDICATES = ["blackout_end", "blackout_until"] as const;

/** The three membership axes an intent bounds (§6.2). */
export const MEMBERSHIP_PREDICATES = [
  "merchant",
  "merchant_id",
  "sku",
  "sku_id",
  "category",
] as const;

function includes(table: readonly string[], predicate: string): boolean {
  return table.includes(predicate);
}

export function constraintDirectionOf(
  predicate: string | null,
): ConstraintDirection | null {
  if (predicate === null) {
    return null;
  }
  if (includes(CEILING_PREDICATES, predicate)) {
    return "ceiling";
  }
  if (includes(FLOOR_PREDICATES, predicate)) {
    return "floor";
  }
  return includes(BLACKOUT_END_PREDICATES, predicate) ? "blackout_end" : null;
}

export function isMembershipPredicate(predicate: string | null): boolean {
  return predicate !== null && includes(MEMBERSHIP_PREDICATES, predicate);
}

/** One P3 `constraint` row, minus the provenance the write gate supplies. */
export interface CanonicalConstraint {
  readonly subject: string;
  readonly predicate: string;
  readonly content: MemoryContent;
}

/** §6.2 bounds are about the user as a whole; `subject` is the supersede key. */
export const CONSTRAINT_SUBJECT = "user";

function scalar(
  predicate: string,
  value: unknown,
  extra: MemoryContent = {},
): CanonicalConstraint {
  return {
    subject: CONSTRAINT_SUBJECT,
    predicate,
    content: { value, ...extra },
  };
}

function allowlist(
  predicate: string,
  allow: readonly string[],
  extra: MemoryContent = {},
): CanonicalConstraint {
  return {
    subject: CONSTRAINT_SUBJECT,
    predicate,
    content: { allow: [...allow], ...extra },
  };
}

function moneyBounds(bounds: IntentBounds): readonly CanonicalConstraint[] {
  const { max_amount, currency } = bounds.allowance;
  return [
    scalar("max_amount", max_amount, { currency, unit: "paise" }),
    scalar("max_apr_bps", bounds.credit_policy.max_apr_bps, { unit: "bps" }),
  ];
}

/**
 * `null` means "any" in §6.2, and an absent bound is not the same claim as an
 * empty allowlist — a covenant that names no merchants must not make every
 * merchant a scope-widening attempt.
 *
 * The envelope caps ride in the `category` row's content rather than becoming
 * `cap_paise` rows of their own: R1 matches a bound by predicate alone, so two
 * categories with different caps would make the looser one look like a
 * widening of the tighter one — including while the route is still writing the
 * user's own signed set.
 */
function membershipBounds(
  bounds: IntentBounds,
): readonly CanonicalConstraint[] {
  const found: CanonicalConstraint[] = [];
  if (bounds.merchants !== null) {
    found.push(allowlist("merchant", bounds.merchants));
  }
  if (bounds.skus !== null) {
    found.push(allowlist("sku", bounds.skus));
  }
  if (bounds.envelopes.length > 0) {
    found.push(
      allowlist(
        "category",
        bounds.envelopes.map((envelope) => envelope.category),
        { envelopes: bounds.envelopes.map((envelope) => ({ ...envelope })) },
      ),
    );
  }
  return found;
}

function booleanBounds(bounds: IntentBounds): readonly CanonicalConstraint[] {
  return [
    scalar("requires_refundability", bounds.requires_refundability),
    scalar(
      "user_cart_confirmation_required",
      bounds.user_cart_confirmation_required,
    ),
    scalar("human_present", bounds.human_present),
    scalar("share_aggregates", bounds.share_aggregates),
    scalar("allow_credit", bounds.credit_policy.allow_credit),
  ];
}

function timingBounds(bounds: IntentBounds): readonly CanonicalConstraint[] {
  const found: CanonicalConstraint[] = [scalar("intent_expiry", bounds.intent_expiry)];
  if (bounds.cooloff !== null) {
    found.push(
      scalar("threshold_paise", bounds.cooloff.threshold_paise, { unit: "paise" }),
      scalar("hold_seconds", bounds.cooloff.hold_seconds, { unit: "seconds" }),
    );
  }
  if (bounds.blackout_hours !== null) {
    found.push(scalar("blackout_hours", { ...bounds.blackout_hours }));
  }
  return found;
}

/**
 * Every §6.2 bound but the description, projected onto the canonical
 * predicates (§6.2, §9.1). Composite credential objects are split into the
 * scalars they contain, because a rule compares a `(predicate, value, unit)`
 * triple and cannot walk into `content.allowance.max_amount`.
 */
export function canonicalConstraintsOf(
  bounds: IntentBounds,
): readonly CanonicalConstraint[] {
  return [
    ...moneyBounds(bounds),
    ...membershipBounds(bounds),
    ...booleanBounds(bounds),
    ...timingBounds(bounds),
  ];
}
