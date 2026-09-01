import type {
  IdempotencyOutcome,
  NoncePurpose,
  NonceRegistry,
  NonceState,
  PresentedRequest,
  Sha256Hex,
} from "@covenant/domain";
import { resolveIdempotency, sha256Of } from "@covenant/domain";

export interface Presentation {
  readonly nonce: string;
  readonly purpose: NoncePurpose;
  readonly tenantId: string;
  readonly idempotencyKey: string;
  readonly payloadHash: Sha256Hex;
}

/**
 * The four-state table of §4.5, resolved **before** the pipeline and re-checked
 * inside the write transaction, where the unique index is the authority.
 *
 * Transport idempotency ("same key + same params ⇒ same response") and
 * credential single-use ("a mandate `jti` may be presented once") are two
 * mechanisms and both ship: conflating them would make a retried network
 * request look like a replay attack and a real replay under a fresh key look
 * like a new request. That is why `nonces` carries `payload_hash`,
 * `idempotency_key` **and** `response_json`.
 */
export class IdempotencyResolver {
  constructor(private readonly registry: NonceRegistry) {}

  /** `payload_hash = sha256Hex(canonicalize(parsedBody))` — canonical (§4.5). */
  payloadHash(parsedBody: unknown): Sha256Hex {
    return sha256Of(parsedBody);
  }

  /** Advisory read, used to describe a burn the commit phase just lost to. */
  peek(nonce: string, purpose: NoncePurpose): NonceState | null {
    return this.registry.peek(nonce, purpose);
  }

  resolve(presentation: Presentation): IdempotencyOutcome {
    const stored = this.registry.peek(presentation.nonce, presentation.purpose);
    return resolveIdempotency(stored, presentedOf(presentation));
  }
}

function presentedOf(presentation: Presentation): PresentedRequest {
  return {
    tenantId: presentation.tenantId,
    idempotencyKey: presentation.idempotencyKey,
    payloadHash: presentation.payloadHash,
  };
}
