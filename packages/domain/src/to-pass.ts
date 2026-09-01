import type { Sha256Hex, Sha256Ref } from "./hash-ref.js";
import type { BlackoutWindow } from "./intent-bounds.js";
import type { IsoTimestamp } from "./iso-timestamp.js";
import type { TierLabel } from "./memory-type.js";
import type { ReasonCode } from "./reason-code.js";
import type { MandateRole } from "./trust-role.js";

/** x402-style self-correction: what the caller must change to pass (§4.7). */
export const REMEDIES = [
  "reduce_cart_or_reissue_intent",
  "reissue_intent",
  "reissue_intent_with_later_expiry",
  "reissue_cart_mandate_with_new_jti",
  "upgrade_extension_uri",
  "obtain_signed_attestation",
  "re-derive_digest",
  "renegotiate",
  "request_new_quote",
  "wait_or_reduce",
  "wait_or_cancel",
  "retry_with_new_idempotency_key",
  "none",
] as const;

export type Remedy = (typeof REMEDIES)[number];

export interface IntentBoundsToPass {
  readonly max_amount_paise: number;
  readonly cart_amount_paise: number;
  readonly over_by_paise: number;
  readonly currency: string;
  readonly expires_at: IsoTimestamp;
  readonly now: IsoTimestamp;
  readonly allowed_merchants: readonly string[] | null;
  readonly allowed_skus: readonly string[] | null;
  /** Every predicate that failed, not only the headline one (§8.4 check 1). */
  readonly also_failed: readonly ReasonCode[];
  readonly remedy: Remedy;
}

export interface NonceToPass {
  readonly burned_at: IsoTimestamp;
  readonly burn_event_id: string;
  readonly remedy: Remedy;
}

export interface UriPinToPass {
  readonly expected_uri: string;
  readonly received_uri: string;
  readonly pinned_contexts: readonly string[];
  readonly remedy: Remedy;
}

export interface RiskDataToPass {
  readonly required_signer_roles: readonly MandateRole[];
  readonly schema_ref: string;
  readonly offending_fields: readonly string[];
  readonly blocked_signal_types: readonly string[];
  readonly remedy: Remedy;
}

export interface MemoryDigestToPass {
  readonly expected_digest: Sha256Ref;
  readonly computed_digest: Sha256Ref;
  readonly missing_ids: readonly string[];
  readonly extra_ids: readonly string[];
  readonly required_tier: TierLabel;
  readonly offending_entry_ids: readonly string[];
  readonly their_tiers: readonly TierLabel[];
  readonly remedy: Remedy;
}

export interface QuoteMatchToPass {
  readonly signed_quote_total_paise: number;
  readonly cart_total_paise: number;
  readonly delta_paise: number;
  readonly quote_jti: string;
  readonly quote_expiry: IsoTimestamp;
  readonly remedy: Remedy;
}

/** What the merchant signed for this SKU, and how far under it the quote went. */
export interface PriceFloorToPass {
  readonly sku_id: string;
  readonly floor_paise: number;
  readonly list_paise: number;
  readonly quoted_unit_paise: number;
  readonly below_by_paise: number;
  readonly currency: string;
  readonly declared_at: IsoTimestamp;
  readonly remedy: Remedy;
}

export interface EnvelopeToPass {
  readonly category: string;
  readonly cap_paise: number;
  readonly committed_spent_paise: number;
  readonly open_reservations_paise: number;
  readonly remaining_paise: number;
  readonly requested_paise: number;
  readonly period_resets_at: IsoTimestamp;
  readonly oldest_reservation_expires_at: IsoTimestamp | null;
  readonly remedy: Remedy;
}

export interface CooloffToPass {
  readonly hold_id: string;
  readonly hold_seconds: number;
  readonly executes_at: IsoTimestamp;
  readonly cancel_url: string;
  readonly blackout_window: BlackoutWindow | null;
  readonly intent_expires_at: IsoTimestamp;
  readonly remedy: Remedy;
}

export interface StockConflictToPass {
  readonly sku_id: string;
  readonly reservation_id: string;
  readonly reserved_until: IsoTimestamp;
  readonly requote_tool: string;
  readonly remedy: Remedy;
}

export interface FinalizedToPass {
  readonly current_state: string;
  readonly finalized_at: IsoTimestamp;
  readonly remedy: Remedy;
}

export interface IdempotencyToPass {
  readonly stored_payload_hash: Sha256Hex;
  readonly received_payload_hash: Sha256Hex;
  readonly remedy: Remedy;
}

export interface MemoryWriteToPass {
  readonly claimed_tier: TierLabel | null;
  readonly granted_tier: TierLabel;
  readonly required_tier: TierLabel;
  /** `R1.numeric-relaxation` | `R6.llm-judge` | null (§4.4). */
  readonly rule: string | null;
  readonly remedy: Remedy;
}

export type ToPass =
  | IntentBoundsToPass
  | NonceToPass
  | UriPinToPass
  | RiskDataToPass
  | MemoryDigestToPass
  | QuoteMatchToPass
  | PriceFloorToPass
  | EnvelopeToPass
  | CooloffToPass
  | StockConflictToPass
  | FinalizedToPass
  | IdempotencyToPass
  | MemoryWriteToPass;
