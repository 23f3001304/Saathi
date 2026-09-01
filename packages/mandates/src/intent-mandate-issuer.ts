import type { IntentBounds, MandateSigner } from "@covenant/domain";
import { AP2_EXTENSION_URI, GATEWAY_AUDIENCE } from "@covenant/domain";

import type { IssuedMandate } from "./issued-mandate.js";
import { signMandate } from "./issued-mandate.js";
import type { CredentialEnvelope } from "./vc/credential-envelope.js";

export interface IntentMandateRequest {
  /** `urn:covenant:user:<uuid>` — the intent is self-issued by the user. */
  readonly userIss: string;
  readonly tenantId: string;
  readonly naturalLanguageDescription: string;
  readonly agentInstanceId: string;
  readonly bounds: IntentBounds;
  readonly ttlSeconds: number;
  readonly issuedAt: Date | null;
  readonly jti: string | null;
}

/**
 * Signed by the **user** key (§6.2). Every field of the credential subject
 * except `natural_language_description` becomes a P3 `constraint` memory entry
 * at `POST /covenant/sign` — that is the only way a constraint can be created
 * (§9.2), so what this issuer emits is the whole of the user's authority.
 */
export class IntentMandateIssuer {
  constructor(
    private readonly signer: MandateSigner,
    private readonly envelope: CredentialEnvelope,
  ) {}

  async issue(request: IntentMandateRequest): Promise<IssuedMandate> {
    const payload = this.envelope.issue({
      kind: "intent",
      iss: request.userIss,
      sub: request.userIss,
      aud: GATEWAY_AUDIENCE,
      jti: request.jti,
      issuedAt: request.issuedAt,
      ttlSeconds: request.ttlSeconds,
      credentialSubject: intentSubjectOf(request),
    });
    return signMandate(this.signer, payload, "user");
  }
}

/** Key order follows §6.2 verbatim; a golden-vector test pins it. */
function intentSubjectOf(
  request: IntentMandateRequest,
): Readonly<Record<string, unknown>> {
  const bounds: IntentBounds = request.bounds;
  return {
    id: request.userIss,
    tenant_id: request.tenantId,
    ap2_extension_uri: AP2_EXTENSION_URI,
    natural_language_description: request.naturalLanguageDescription,
    allowance: bounds.allowance,
    merchants: bounds.merchants,
    skus: bounds.skus,
    requires_refundability: bounds.requires_refundability,
    user_cart_confirmation_required: bounds.user_cart_confirmation_required,
    human_present: bounds.human_present,
    intent_expiry: bounds.intent_expiry,
    envelopes: bounds.envelopes,
    cooloff: bounds.cooloff,
    blackout_hours: bounds.blackout_hours,
    credit_policy: bounds.credit_policy,
    share_aggregates: bounds.share_aggregates,
    agent_instance_id: request.agentInstanceId,
  };
}
