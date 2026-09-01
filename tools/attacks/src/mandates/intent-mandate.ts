import { sha256Hex } from "../crypto/hash.js";
import { epochSeconds, mintJti, signCompact } from "../crypto/jws.js";
import type { TrustRing } from "../crypto/trust-ring.js";
import {
  AP2_EXTENSION_URI,
  CREDENTIAL_TYPE_OF,
  GATEWAY_AUDIENCE,
  PINNED_CONTEXT_URIS,
  VERIFIABLE_CREDENTIAL,
} from "../protocol.js";

export interface EnvelopeDecl {
  readonly category: string;
  readonly period: "day" | "week" | "month";
  readonly cap_paise: number;
}

export interface BoundsSpec {
  readonly maxAmountPaise: number;
  readonly currency: string;
  readonly merchants: readonly string[] | null;
  readonly skus: readonly string[] | null;
  readonly requiresRefundability: boolean;
  readonly userCartConfirmationRequired: boolean;
  readonly humanPresent: boolean;
  readonly envelopes: readonly EnvelopeDecl[];
  readonly cooloffThresholdPaise: number;
  readonly cooloffHoldSeconds: number;
  readonly ttlSeconds: number;
}

export interface IssuedMandate {
  readonly jwt: string;
  readonly jti: string;
  readonly jwtHash: string;
}

export interface IntentRequest {
  readonly tenantId: string;
  readonly description: string;
  readonly agentInstanceId: string;
  readonly bounds: BoundsSpec;
  readonly issuedAt: Date;
}

function iso(now: Date, offsetMs: number): string {
  return new Date(now.getTime() + offsetMs).toISOString();
}

/** §6.2's `credentialSubject`, field for field. */
function subjectOf(
  request: IntentRequest,
  userIss: string,
): Readonly<Record<string, unknown>> {
  const bounds = request.bounds;
  const expiry = iso(request.issuedAt, bounds.ttlSeconds * 1000);
  return {
    id: userIss,
    tenant_id: request.tenantId,
    ap2_extension_uri: AP2_EXTENSION_URI,
    natural_language_description: request.description,
    allowance: {
      reason: "one_time",
      max_amount: bounds.maxAmountPaise,
      currency: bounds.currency,
      expires_at: expiry,
      merchant_id: null,
      checkout_session_id: null,
    },
    merchants: bounds.merchants,
    skus: bounds.skus,
    requires_refundability: bounds.requiresRefundability,
    user_cart_confirmation_required: bounds.userCartConfirmationRequired,
    human_present: bounds.humanPresent,
    intent_expiry: expiry,
    envelopes: bounds.envelopes,
    cooloff: {
      threshold_paise: bounds.cooloffThresholdPaise,
      hold_seconds: bounds.cooloffHoldSeconds,
    },
    blackout_hours: null,
    credit_policy: { allow_credit: false, max_apr_bps: 0 },
    share_aggregates: false,
    agent_instance_id: request.agentInstanceId,
  };
}

/**
 * Signed by the **user** key. Every field but the description becomes a P3
 * `constraint` at `POST /covenant/sign` (§9.2) — which is why T-1 has to
 * attack the memory write gate rather than the mandate: there is no other
 * door into a constraint.
 */
export function issueIntent(
  ring: TrustRing,
  request: IntentRequest,
): IssuedMandate {
  const userIss = ring.issuerFor("user");
  const iat = epochSeconds(request.issuedAt);
  const jti = mintJti();
  const jwt = signCompact(ring, "user", {
    iss: userIss,
    sub: userIss,
    aud: GATEWAY_AUDIENCE,
    iat,
    nbf: iat,
    exp: iat + request.bounds.ttlSeconds,
    jti,
    vc: {
      "@context": [...PINNED_CONTEXT_URIS],
      type: [VERIFIABLE_CREDENTIAL, CREDENTIAL_TYPE_OF["intent"]],
      issuer: userIss,
      validFrom: request.issuedAt.toISOString(),
      credentialSubject: subjectOf(request, userIss),
    },
  });
  return { jwt, jti, jwtHash: sha256Hex(jwt) };
}
