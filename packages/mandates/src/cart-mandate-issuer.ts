import type {
  CartQuoteRef,
  Clock,
  MandateSigner,
  PaymentRequest,
  RiskData,
  Sha256Hex,
  Sha256Ref,
  TierLabel,
} from "@covenant/domain";
import {
  AP2_EXTENSION_URI,
  GATEWAY_AUDIENCE,
  MEMORY_DIGEST_ALG,
  toSha256Ref,
} from "@covenant/domain";

import { cartHashOf } from "./cart-hash.js";
import type { IssuedMandate } from "./issued-mandate.js";
import { signMandate } from "./issued-mandate.js";
import type { CredentialEnvelope } from "./vc/credential-envelope.js";
import type { MerchantAuthorization } from "./vc/merchant-authorization.js";

export interface CartMandateRequest {
  readonly merchantIss: string;
  readonly userSub: string;
  readonly tenantId: string;
  readonly cartId: string;
  readonly intentJti: string;
  readonly intentJwtHash: Sha256Hex;
  readonly paymentRequest: PaymentRequest;
  readonly memoryDigest: Sha256Ref;
  readonly memoryEntryIds: readonly string[];
  readonly memoryTierFloor: TierLabel;
  readonly riskData: RiskData | null;
  readonly quote: CartQuoteRef;
  readonly agentInstanceId: string;
  readonly ttlSeconds: number;
  readonly issuedAt: Date | null;
  readonly jti: string | null;
}

/**
 * Signed by the **merchant** key (§6.3). `memory_digest` is a signed field, not
 * an annotation: recomputing it from `memory_entry_ids` is what makes
 * post-signing memory tampering detectable and gives the audit trail "which
 * beliefs, at which trust tiers, produced this charge".
 */
export class CartMandateIssuer {
  constructor(
    private readonly signer: MandateSigner,
    private readonly envelope: CredentialEnvelope,
    private readonly merchantAuthorization: MerchantAuthorization,
    private readonly clock: Clock,
  ) {}

  async issue(request: CartMandateRequest): Promise<IssuedMandate> {
    const cartHash = cartHashOf(request.paymentRequest);
    const issuedAt = request.issuedAt ?? this.clock.now();
    const authorization = await this.merchantAuthorization.issue({
      merchantIss: request.merchantIss,
      cartId: request.cartId,
      cartHash,
      issuedAt,
      ttlSeconds: request.ttlSeconds,
    });
    const payload = this.envelope.issue({
      kind: "cart",
      iss: request.merchantIss,
      sub: request.userSub,
      aud: GATEWAY_AUDIENCE,
      jti: request.jti,
      issuedAt,
      ttlSeconds: request.ttlSeconds,
      credentialSubject: cartSubjectOf(request, cartHash, authorization),
    });
    return signMandate(this.signer, payload, "merchant");
  }
}

/** Key order follows §6.3 verbatim; a golden-vector test pins it. */
function cartSubjectOf(
  request: CartMandateRequest,
  cartHash: Sha256Ref,
  merchantAuthorization: string,
): Readonly<Record<string, unknown>> {
  return {
    id: request.cartId,
    tenant_id: request.tenantId,
    ap2_extension_uri: AP2_EXTENSION_URI,
    intent_mandate_jti: request.intentJti,
    intent_mandate_hash: toSha256Ref(request.intentJwtHash),
    payment_request: request.paymentRequest,
    cart_hash: cartHash,
    merchant_authorization: merchantAuthorization,
    memory_digest: request.memoryDigest,
    memory_digest_alg: MEMORY_DIGEST_ALG,
    memory_entry_ids: request.memoryEntryIds,
    memory_tier_floor: request.memoryTierFloor,
    risk_data: request.riskData,
    quote: request.quote,
    agent_instance_id: request.agentInstanceId,
  };
}
