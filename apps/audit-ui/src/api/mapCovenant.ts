// `GET /v1/covenant` in the gateway's own shape, turned into the sentences the
// Rules screen reads. The route answers in predicates and raw content objects;
// this is the only place that knows how those become "Never above ₹2,000".
import type { Constraint, CovenantSnapshot, Envelope } from "./types.ts";

export interface RawConstraint {
  readonly id: string;
  readonly predicate: string;
  readonly content: Record<string, unknown>;
}

export interface RawCovenant {
  readonly constraints: readonly RawConstraint[];
  readonly envelopes?: readonly {
    category: string;
    period: string;
    cap_paise: number;
  }[];
  readonly cooloff_rules?: {
    threshold_paise?: number;
    hold_seconds?: number;
  } | null;
  readonly merchants?: readonly string[];
  readonly skus?: readonly string[];
}

type Shape = { label: string; unit: Constraint["unit"] };

const SHAPES: Record<string, Shape> = {
  max_amount: { label: "Never above", unit: "paise" },
  intent_expiry: { label: "Authorization expires", unit: "time" },
  threshold_paise: { label: "Cool-off above", unit: "paise" },
  hold_seconds: { label: "Cool-off wait", unit: "window" },
  max_apr_bps: { label: "No credit above APR", unit: "percent" },
  allow_credit: { label: "Credit allowed", unit: "boolean" },
  requires_refundability: { label: "Refundability required", unit: "boolean" },
  human_present: { label: "Human present required", unit: "boolean" },
  user_cart_confirmation_required: {
    label: "Confirm every cart",
    unit: "boolean",
  },
  share_aggregates: { label: "Share anonymised aggregates", unit: "boolean" },
  category: { label: "Categories allowed", unit: "category" },
  merchant: { label: "Merchants allowed", unit: "category" },
  sku: { label: "Products allowed", unit: "category" },
};

/** `allowance` restates `max_amount` and its expiry as one composite object;
 *  both scalars arrive separately, so showing it too would say it twice. */
const COMPOSITE = "allowance";

function humanise(predicate: string): string {
  const words = predicate.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function valueOf(raw: RawConstraint): string | number | boolean | null {
  const content = raw.content;
  const allow = content["allow"];
  if (Array.isArray(allow)) return allow.join(", ");
  const value = content["value"];
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return scaled(raw.predicate, value);
  return null;
}

/** Basis points and seconds are the wire's units, not the reader's. */
function scaled(predicate: string, value: number): number {
  if (predicate === "max_apr_bps") return value / 100;
  if (predicate === "hold_seconds") return value / 3600;
  return value;
}

function constraintOf(raw: RawConstraint): Constraint | null {
  if (raw.predicate === COMPOSITE) return null;
  const value = valueOf(raw);
  if (value === null) return null;
  const shape = SHAPES[raw.predicate];
  return {
    key: raw.predicate,
    label: shape?.label ?? humanise(raw.predicate),
    value,
    unit: shape?.unit,
    amended: false,
  };
}

/** The gateway reports the envelope's ceiling, not what has been spent against
 *  it. Reporting zero spend would be a claim; the editor shows the cap alone. */
function envelopeOf(raw: { category: string; cap_paise: number }): Envelope {
  return {
    category: raw.category,
    capturedPaise: 0,
    committedPaise: 0,
    capPaise: raw.cap_paise,
  };
}

function cooloffOf(raw: RawCovenant): CovenantSnapshot["cooloffRules"] {
  const threshold = raw.cooloff_rules?.threshold_paise;
  const hold = raw.cooloff_rules?.hold_seconds;
  if (threshold === undefined || hold === undefined) return [];
  return [{ thresholdPaise: threshold, durationHours: hold / 3600 }];
}

export function mapCovenant(raw: RawCovenant): CovenantSnapshot {
  return {
    constraints: raw.constraints
      .map(constraintOf)
      .filter((c): c is Constraint => c !== null),
    envelopes: (raw.envelopes ?? []).map(envelopeOf),
    cooloffRules: cooloffOf(raw),
    merchants: [...(raw.merchants ?? [])],
    skus: [...(raw.skus ?? [])],
  };
}
