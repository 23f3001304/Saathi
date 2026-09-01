import { sha256Hex, sha256RefOf, toSha256Ref } from "../crypto/hash.js";
import { epochSeconds, mintJti, signCompact } from "../crypto/jws.js";
import type { TrustRing } from "../crypto/trust-ring.js";
import {
  AP2_EXTENSION_URI,
  CREDENTIAL_TYPE_OF,
  GATEWAY_AUDIENCE,
  MEMORY_DIGEST_ALG,
  PINNED_CONTEXT_URIS,
  VERIFIABLE_CREDENTIAL,
} from "../protocol.js";
import type { IssuedMandate } from "./intent-mandate.js";
import type { CartSpec } from "./payment-request.js";
import { paymentRequestOf, totalPaiseOf } from "./payment-request.js";

export interface QuoteRef {
  readonly quote_jti: string;
  readonly quote_total_paise: number;
  readonly quote_expiry: string;
  readonly reservation_id: string;
  readonly reservation_expires_at: string;
}

export interface CartRequest {
  readonly tenantId: string;
  readonly cart: CartSpec;
  readonly intentJti: string;
  readonly intentJwtHash: string;
  readonly memoryDigest: string;
  readonly memoryEntryIds: readonly string[];
  readonly quote: QuoteRef;
  readonly agentInstanceId: string;
  readonly ttlSeconds: number;
  readonly issuedAt: Date;
  /** T-27 overrides this; every honest path leaves it at the pinned URI. */
  readonly extensionUri?: string;
  /** Pinning the nonce lets T-27 prove the rejected presentation burned nothing. */
  readonly jti?: string;
}

export interface IssuedCart extends IssuedMandate {
  readonly cartHash: string;
  readonly totalPaise: number;
}

/** §6.6 — exactly A.2's claim set, no `vc`; a second statement over the hash. */
function merchantAuthorization(
  ring: TrustRing,
  request: CartRequest,
  cartHash: string,
): string {
  const iat = epochSeconds(request.issuedAt);
  return signCompact(ring, "merchant", {
    iss: ring.issuerFor("merchant"),
    sub: request.cart.id,
    aud: GATEWAY_AUDIENCE,
    iat,
    exp: iat + request.ttlSeconds,
    jti: mintJti(),
    cart_hash: cartHash,
  });
}

function subjectOf(
  request: CartRequest,
  paymentRequest: Readonly<Record<string, unknown>>,
  cartHash: string,
  authorization: string,
): Readonly<Record<string, unknown>> {
  return {
    id: request.cart.id,
    tenant_id: request.tenantId,
    ap2_extension_uri: request.extensionUri ?? AP2_EXTENSION_URI,
    intent_mandate_jti: request.intentJti,
    intent_mandate_hash: toSha256Ref(request.intentJwtHash),
    payment_request: paymentRequest,
    cart_hash: cartHash,
    merchant_authorization: authorization,
    memory_digest: request.memoryDigest,
    memory_digest_alg: MEMORY_DIGEST_ALG,
    memory_entry_ids: request.memoryEntryIds,
    memory_tier_floor: "P1",
    risk_data: null,
    quote: request.quote,
    agent_instance_id: request.agentInstanceId,
  };
}

/**
 * Signed by the **merchant** key (§6.3). `memory_digest` is a signed field, so
 * a cart the harness mints is bound to the exact belief set the retrieval
 * returned — T-1's whole point is that the poisoned belief never gets into
 * that set in the first place.
 */
export function issueCart(ring: TrustRing, request: CartRequest): IssuedCart {
  const paymentRequest = paymentRequestOf(request.cart);
  const cartHash = sha256RefOf(paymentRequest);
  const authorization = merchantAuthorization(ring, request, cartHash);
  const merchantIss = ring.issuerFor("merchant");
  const iat = epochSeconds(request.issuedAt);
  const jti = request.jti ?? mintJti();
  const jwt = signCompact(ring, "merchant", {
    iss: merchantIss,
    sub: ring.issuerFor("user"),
    aud: GATEWAY_AUDIENCE,
    iat,
    nbf: iat,
    exp: iat + request.ttlSeconds,
    jti,
    vc: {
      "@context": [...PINNED_CONTEXT_URIS],
      type: [VERIFIABLE_CREDENTIAL, CREDENTIAL_TYPE_OF["cart"]],
      issuer: merchantIss,
      credentialSubject: subjectOf(request, paymentRequest, cartHash, authorization),
    },
  });
  return {
    jwt,
    jti,
    jwtHash: sha256Hex(jwt),
    cartHash,
    totalPaise: totalPaiseOf(request.cart.lines),
  };
}
