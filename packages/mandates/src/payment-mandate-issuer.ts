import type {
  Clock,
  IsoTimestamp,
  MandateSigner,
  Sha256Hex,
  Sha256Ref,
  VerdictSeal,
} from "@covenant/domain";
import {
  AP2_EXTENSION_URI,
  EXECUTOR_AUDIENCE,
  GATEWAY_ISSUER,
  toSha256Ref,
} from "@covenant/domain";

import type { IssuedMandate } from "./issued-mandate.js";
import { signMandate } from "./issued-mandate.js";
import type { CredentialEnvelope } from "./vc/credential-envelope.js";
import type { UserAuthorization } from "./vc/user-authorization.js";
import { USER_AUTHORIZATION_FIELD } from "./vc/user-authorization.js";

export interface PaymentMandateRequest {
  readonly userSub: string;
  readonly tenantId: string;
  readonly paymentId: string;
  readonly cartJti: string;
  readonly cartJwtHash: Sha256Hex;
  readonly intentMandateHash: Sha256Ref;
  readonly memoryDigest: Sha256Ref;
  readonly amount: number;
  readonly currency: string;
  readonly merchantId: string;
  readonly paymentToken: string;
  readonly agentInstanceId: string;
  readonly verdicts: readonly VerdictSeal[];
  readonly executeNotBefore: IsoTimestamp;
  readonly envelopeReservationId: string | null;
  readonly ttlSeconds: number;
  readonly issuedAt: Date | null;
  readonly jti: string | null;
}

export interface PaymentMandateDraft extends IssuedMandate {
  /** `sha256(canonicalize(credentialSubject minus user_authorization))` (§6.5). */
  readonly bodyHash: Sha256Ref;
  readonly subject: Readonly<Record<string, unknown>>;
  readonly issuedAt: Date;
}

/**
 * Issued and signed by the **gateway** key (§6.4), in two phases because the
 * payment mandate does not exist until the gateway issues it (§6.5). The draft
 * and the final share one `jti`, one `iat` and one `exp`: the user signs a body
 * hash, and re-deriving that hash from the final mandate has to give the same
 * answer or the signature proves nothing.
 */
export class PaymentMandateIssuer {
  constructor(
    private readonly signer: MandateSigner,
    private readonly envelope: CredentialEnvelope,
    private readonly userAuthorization: UserAuthorization,
    private readonly clock: Clock,
  ) {}

  /** Phase 1–2: the draft the verify-cart response returns for signing. */
  async issueDraft(
    request: PaymentMandateRequest,
  ): Promise<PaymentMandateDraft> {
    const issuedAt = request.issuedAt ?? this.clock.now();
    const subject = paymentSubjectOf(request, null);
    const payload = this.envelope.issue({
      kind: "payment",
      iss: GATEWAY_ISSUER,
      sub: request.userSub,
      aud: EXECUTOR_AUDIENCE,
      jti: request.jti,
      issuedAt,
      ttlSeconds: request.ttlSeconds,
      credentialSubject: subject,
    });
    const issued = await signMandate(this.signer, payload, "gateway");
    return {
      ...issued,
      subject,
      issuedAt,
      bodyHash: this.userAuthorization.bodyHash(subject),
    };
  }

  /** Phase 4: embed the user's inner JWT and re-sign the final mandate. */
  async issueFinal(
    draft: PaymentMandateDraft,
    userAuthorizationJwt: string,
  ): Promise<IssuedMandate> {
    const subject = {
      ...draft.subject,
      [USER_AUTHORIZATION_FIELD]: userAuthorizationJwt,
    };
    const payload = {
      ...draft.payload,
      vc: { ...draft.payload.vc, credentialSubject: subject },
    };
    return signMandate(this.signer, payload, "gateway");
  }
}

/** Key order follows §6.4 verbatim; a golden-vector test pins it. */
function paymentSubjectOf(
  request: PaymentMandateRequest,
  userAuthorization: string | null,
): Readonly<Record<string, unknown>> {
  return {
    id: request.paymentId,
    tenant_id: request.tenantId,
    ap2_extension_uri: AP2_EXTENSION_URI,
    cart_mandate_jti: request.cartJti,
    cart_mandate_hash: toSha256Ref(request.cartJwtHash),
    intent_mandate_hash: request.intentMandateHash,
    memory_digest: request.memoryDigest,
    amount: request.amount,
    currency: request.currency,
    merchant_id: request.merchantId,
    payment_token: request.paymentToken,
    agent_instance_id: request.agentInstanceId,
    verdicts: request.verdicts,
    execute_not_before: request.executeNotBefore,
    envelope_reservation_id: request.envelopeReservationId,
    [USER_AUTHORIZATION_FIELD]: userAuthorization,
  };
}
