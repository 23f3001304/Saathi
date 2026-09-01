import type {
  BlackoutHours,
  CooloffRule,
  CreditPolicy,
  EnvelopeDeclaration,
  IntentAllowance,
  IntentBounds,
  IntentMandate,
  MandateEnvelope,
} from "@covenant/domain";
import { ENVELOPE_PERIODS } from "@covenant/domain";

import {
  array,
  bool,
  int,
  nullable,
  nullableStr,
  nullableStrings,
  oneOf,
  record,
  str,
  timestamp,
} from "./subject-fields.js";

/** Everything an Intent Mandate adds on top of the shared envelope (§6.2). */
export type IntentSubject = Omit<IntentMandate, keyof MandateEnvelope | "kind">;

export function readIntentSubject(
  raw: Readonly<Record<string, unknown>>,
): IntentSubject {
  return {
    id: str(raw["id"]),
    natural_language_description: str(raw["natural_language_description"]),
    agent_instance_id: str(raw["agent_instance_id"]),
    ...readBounds(raw),
  };
}

function readBounds(raw: Readonly<Record<string, unknown>>): IntentBounds {
  return {
    allowance: readAllowance(record(raw["allowance"])),
    merchants: nullableStrings(raw["merchants"]),
    skus: nullableStrings(raw["skus"]),
    requires_refundability: bool(raw["requires_refundability"]),
    user_cart_confirmation_required: bool(
      raw["user_cart_confirmation_required"],
    ),
    human_present: bool(raw["human_present"]),
    intent_expiry: timestamp(raw["intent_expiry"]),
    envelopes: array(raw["envelopes"]).map((entry) => readEnvelope(entry)),
    cooloff: nullable(raw["cooloff"], readCooloff),
    blackout_hours: nullable(raw["blackout_hours"], readBlackout),
    credit_policy: readCreditPolicy(record(raw["credit_policy"])),
    share_aggregates: bool(raw["share_aggregates"]),
  };
}

/** ACP allowance object, adopted field-for-field — no renames (§A.1). */
function readAllowance(raw: Record<string, unknown>): IntentAllowance {
  return {
    reason: oneOf(raw["reason"], ["one_time"] as const),
    max_amount: int(raw["max_amount"]),
    currency: str(raw["currency"]),
    expires_at: timestamp(raw["expires_at"]),
    merchant_id: nullableStr(raw["merchant_id"]),
    checkout_session_id: nullableStr(raw["checkout_session_id"]),
  };
}

function readEnvelope(value: unknown): EnvelopeDeclaration {
  const raw = record(value);
  return {
    category: str(raw["category"]),
    period: oneOf(raw["period"], ENVELOPE_PERIODS),
    cap_paise: int(raw["cap_paise"]),
  };
}

function readCooloff(value: unknown): CooloffRule {
  const raw = record(value);
  return {
    threshold_paise: int(raw["threshold_paise"]),
    hold_seconds: int(raw["hold_seconds"]),
  };
}

function readBlackout(value: unknown): BlackoutHours {
  const raw = record(value);
  return { tz: str(raw["tz"]), from: str(raw["from"]), to: str(raw["to"]) };
}

function readCreditPolicy(raw: Record<string, unknown>): CreditPolicy {
  return {
    allow_credit: bool(raw["allow_credit"]),
    max_apr_bps: int(raw["max_apr_bps"]),
  };
}
