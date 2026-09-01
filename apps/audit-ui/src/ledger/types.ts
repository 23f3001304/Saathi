// §4.2 — the event frame contract. This is the shared artifact between the
// UI and the gateway: fixtures and the real SSE stream both emit exactly
// this shape, so the swap from one to the other is config-only.

export type EventActor =
  "user" | "buyer_agent" | "merchant_agent" | "gateway" | "razorpay" | "system";

export const KNOWN_EVENT_KINDS = [
  "intent.drafted",
  "intent.signed",
  "intent.amended",
  "memory.write.committed",
  "memory.write.rejected",
  "memory.retrieved",
  "catalog.quote.received",
  "cart.assembled",
  "cart.digest.computed",
  "mandate.issued",
  "verdict.emitted",
  "cooloff.parked",
  "cooloff.cancelled",
  "cooloff.released",
  "rzp.order.created",
  "rzp.link.created",
  "rzp.polled",
  "payment.captured",
  "payment.failed",
  "attack.detected",
  "fold.materialized",
  "replay.verified",
] as const;

export type EventKind = (typeof KNOWN_EVENT_KINDS)[number];

/** §4.2 note: "unknown kinds render as a neutral pulli" — never trust the wire type alone. */
export function isKnownEventKind(kind: string): kind is EventKind {
  return (KNOWN_EVENT_KINDS as readonly string[]).includes(kind);
}

export type LedgerFrame = {
  id: number;
  ts: string;
  actor: EventActor;
  kind: EventKind;
  txn_id: string | null;
  payload: unknown;
  prev_hash: string;
  this_hash: string;
};

export type ConnectionMode = "sse" | "polling" | "offline";

/** Where the frames came from. Never inferred, always set by the provider. */
export type LedgerSource = "live" | "fixtures";

// ---- payload shapes, narrowed at the reducer boundary by `kind` ----------

export type MemoryTier = "P3" | "P2" | "P1" | "P0";
export type MemoryType =
  "constraint" | "preference" | "fact" | "episode" | "procedure";

export interface MemoryEntryPayload {
  id: string;
  type: MemoryType;
  tier: MemoryTier;
  content: string;
  hash: string;
  source_channel: string;
  t_valid: string;
  t_invalid: string | null;
  t_created: string;
  t_expired: string | null;
}

/** The gateway sends `rule`, `human`, `attack_id` and `content_excerpt` too;
 *  undeclared, they left the UI showing codes where a sentence existed. */
export interface MemoryRejectedPayload extends MemoryEntryPayload {
  reason_code: string;
  rule?: string | null;
  human?: string;
  attack_id?: string | null;
  content_excerpt?: string | null;
}

export interface IntentBoundsPayload {
  max_amount_paise: number;
  merchants: string[] | null;
  skus: string[] | null;
  requires_refundability: boolean | null;
  intent_expiry: string;
}

export interface IntentPayload {
  intent_id: string;
  natural_language_description: string;
  bounds: IntentBoundsPayload;
  signed_at: string | null;
  thumbprint: string | null;
}

export interface CartItemPayload {
  sku: string;
  title: string;
  quantity: number;
  unit_price_paise: number;
  merchant: string;
}

export interface CartPayload {
  cart_id: string;
  items: CartItemPayload[];
  total_paise: number;
  quote_signature_valid: boolean;
  memory_digest: string;
  justified_by: string[];
}

export type SealCheck =
  | "intent_bounds"
  | "nonce"
  | "uri_pin"
  | "risk_data"
  | "memory_digest"
  | "quote_match"
  | "envelope"
  | "cooloff";

export interface ToPass {
  [field: string]: string | number;
}

export interface VerdictCheckResult {
  check: SealCheck;
  passed: boolean;
  /**
   * The gateway's third outcome (decision 37): a cooling-off hold is neither
   * an approval nor a rejection, so it rides alongside `passed` rather than
   * being flattened into it.
   */
  held?: boolean;
  reason_code?: string;
  human_sentence?: string;
  to_pass?: ToPass;
}

/**
 * A stage-0 admission rejection (malformed mandate, bad signature, a T-27
 * URI downgrade caught before the check pipeline runs) never reaches the
 * seals at all — `checks` is `[]` and the reason lives here instead. The
 * thread simply never gets there; D7's "held = absence of a stamp" reading
 * extends to "stage-0 = absence of the whole row."
 */
export interface Stage0Rejection {
  reason_code: string;
  human_sentence?: string;
  to_pass?: ToPass;
}

export interface VerdictPayload {
  txn_id: string;
  checks: VerdictCheckResult[];
  latency_ms: number;
  stage0_rejection?: Stage0Rejection;
}

export interface RzpCallPayload {
  call: "order.created" | "link.created" | "polled" | "webhook";
  id: string;
  idempotency_key: string;
  agent_present: boolean;
}

export interface OutcomePayload {
  status: "pending" | "captured" | "failed" | "parked";
  amount_paise: number;
  captured_at: string | null;
  poll_attempt?: number;
  poll_of?: number;
}

export interface CooloffPayload {
  id: string;
  txn_id: string;
  amount_paise: number;
  release_at: string;
  merchant: string;
  cues: string[];
}

export interface AttackDetectedPayload {
  attack_id: string | null;
  reason_code: string;
  human: string;
  detail_kind: string;
}

export interface FoldMaterializedPayload {
  fold: string;
  ms: number;
}
