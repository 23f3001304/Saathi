import type {
  Clock,
  IdempotencyOutcome,
  MandateEnvelope,
  MandateKind,
  NonceBurnRecord,
  NonceBurnResult,
  NoncePurpose,
  NonceRegistry,
  NonceState,
  NonceToPass,
  PresentedRequest,
  Sha256Hex,
} from "@covenant/domain";
import { resolveIdempotency, sha256Of, toIsoTimestamp } from "@covenant/domain";

/** The same transaction legitimately burns a cart nonce and a payment nonce. */
export const PURPOSE_OF: Readonly<Record<MandateKind, NoncePurpose | null>> = {
  intent: null,
  cart: "cart_verify",
  payment: "payment_execute",
};

export interface BurnRequest {
  readonly nonce: string;
  readonly purpose: NoncePurpose;
  readonly presented: PresentedRequest;
  readonly burnEventId: string;
  readonly responseJson: string;
}

/**
 * The `jti` IS the nonce (§6.1): one presentation, one burn. This class owns
 * the mandate-side half — which jti, for which purpose, and how a stored burn
 * resolves against a presented request. The *enforcement* is the registry's
 * `INSERT` hitting `PRIMARY KEY (nonce, purpose)`, because a read-then-write
 * check would be a TOCTOU hole (§5.2 a); `peek` here is advisory and exists to
 * build a good `to_pass`.
 */
export class NonceGuard {
  constructor(
    private readonly registry: NonceRegistry,
    private readonly clock: Clock,
  ) {}

  /** `payload_hash = sha256Hex(canonicalize(parsedBody))` (§4.5). */
  payloadHash(parsedBody: unknown): Sha256Hex {
    return sha256Of(parsedBody);
  }

  /** The four states of §4.5, resolved by domain's pure `resolveIdempotency`. */
  inspect(
    nonce: string,
    purpose: NoncePurpose,
    presented: PresentedRequest,
  ): IdempotencyOutcome {
    return resolveIdempotency(this.registry.peek(nonce, purpose), presented);
  }

  burn(request: BurnRequest): NonceBurnResult {
    return this.registry.burn(this.recordFor(request));
  }

  private recordFor(request: BurnRequest): NonceBurnRecord {
    return {
      nonce: request.nonce,
      purpose: request.purpose,
      tenantId: request.presented.tenantId,
      payloadHash: request.presented.payloadHash,
      idempotencyKey: request.presented.idempotencyKey,
      burnedAt: toIsoTimestamp(this.clock.now()),
      burnEventId: request.burnEventId,
      responseJson: request.responseJson,
    };
  }
}

export function purposeOf(
  envelope: MandateEnvelope,
  kind: MandateKind,
): {
  readonly nonce: string;
  readonly purpose: NoncePurpose | null;
} {
  return { nonce: envelope.jti, purpose: PURPOSE_OF[kind] };
}

/**
 * The loser of a double-present gets told exactly how to recover: reissue the
 * cart mandate with a fresh `jti` (§5.2 a). Nothing about a cross-tenant burn
 * is ever disclosed, so that path passes `state: null` and gets no `to_pass`.
 */
export function nonceToPass(state: NonceState | null): NonceToPass | null {
  return state === null
    ? null
    : {
        burned_at: state.burnedAt,
        burn_event_id: state.burnEventId,
        remedy: "reissue_cart_mandate_with_new_jti",
      };
}
