import type { Sha256Hex } from "../hash-ref.js";
import type { IsoTimestamp } from "../iso-timestamp.js";

/** The same transaction legitimately burns a cart nonce and a payment nonce. */
export const NONCE_PURPOSES = ["cart_verify", "payment_execute"] as const;

export type NoncePurpose = (typeof NONCE_PURPOSES)[number];

/** One row of `nonces` (§3.6) — the mandate `jti` is the nonce. */
export interface NonceState {
  readonly nonce: string;
  readonly purpose: NoncePurpose;
  readonly tenantId: string;
  readonly payloadHash: Sha256Hex;
  readonly idempotencyKey: string;
  readonly burnedAt: IsoTimestamp;
  readonly burnEventId: string;
  /** Replayed verbatim on an identical retry (§4.5), so it is stored. */
  readonly responseJson: string;
}

export type NonceBurnRecord = NonceState;

export type NonceBurnResult =
  | { readonly status: "burned" }
  | { readonly status: "replay"; readonly state: NonceState }
  | { readonly status: "conflict"; readonly state: NonceState };

/**
 * `peek` is advisory — it exists to diagnose and to build a good `to_pass`.
 * `burn` is the enforcement: its `INSERT` hits `PRIMARY KEY (nonce, purpose)`,
 * and a read-then-write check would be a TOCTOU hole (decision 36).
 */
export interface NonceRegistry {
  peek(nonce: string, purpose: NoncePurpose): NonceState | null;
  burn(record: NonceBurnRecord): NonceBurnResult;
}

export interface PresentedRequest {
  readonly tenantId: string;
  readonly idempotencyKey: string;
  readonly payloadHash: Sha256Hex;
}

/**
 * The four states of §4.5. Transport idempotency (ACP: same key + same params
 * ⇒ same response) and credential single-use (AP2: one `jti`, one
 * presentation) are separate mechanisms and both ship (decision 21).
 */
export type IdempotencyOutcome =
  | { readonly status: "fresh" }
  | {
      readonly status: "replay";
      readonly responseJson: string;
      readonly burnedAt: IsoTimestamp;
    }
  | {
      readonly status: "conflict";
      readonly storedPayloadHash: Sha256Hex;
      readonly receivedPayloadHash: Sha256Hex;
    }
  | {
      readonly status: "burned";
      readonly reasonCode: "NONCE_BURNED" | "TENANT_MISMATCH";
      /** Withheld on a cross-tenant hit: nothing about the burn is disclosed. */
      readonly state: NonceState | null;
    };

export function resolveIdempotency(
  stored: NonceState | null,
  presented: PresentedRequest,
): IdempotencyOutcome {
  if (stored === null) {
    return { status: "fresh" };
  }
  if (stored.tenantId !== presented.tenantId) {
    return { status: "burned", reasonCode: "TENANT_MISMATCH", state: null };
  }
  if (stored.idempotencyKey !== presented.idempotencyKey) {
    return { status: "burned", reasonCode: "NONCE_BURNED", state: stored };
  }
  if (stored.payloadHash !== presented.payloadHash) {
    return {
      status: "conflict",
      storedPayloadHash: stored.payloadHash,
      receivedPayloadHash: presented.payloadHash,
    };
  }
  return {
    status: "replay",
    responseJson: stored.responseJson,
    burnedAt: stored.burnedAt,
  };
}
