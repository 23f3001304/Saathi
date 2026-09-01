import type { VerdictSeal } from "@covenant/domain";
import { CHECK_IDS } from "@covenant/domain";

import type { IssuedMandate, PaymentMandateDraft } from "../src/index.js";
import {
  CartMandateIssuer,
  IntentMandateIssuer,
  PaymentMandateIssuer,
} from "../src/index.js";
import type { Harness } from "./fixtures.js";
import {
  AGENT_URN,
  BOUNDS,
  MEMORY_DIGEST,
  MERCHANT_URN,
  PAYMENT_REQUEST,
  QUOTE,
  TENANT,
  USER_URN,
} from "./fixtures.js";

export const CART_TTL = 900;

export const ALL_PASS: readonly VerdictSeal[] = CHECK_IDS.map((check) => ({
  check,
  outcome: "pass",
}));

export function issueIntent(harness: Harness): Promise<IssuedMandate> {
  return new IntentMandateIssuer(harness.signer, harness.envelope).issue({
    userIss: USER_URN,
    tenantId: TENANT,
    naturalLanguageDescription:
      "Buy one pair of running shoes under Rs 2,000, refundable, from Kolam Run.",
    agentInstanceId: AGENT_URN,
    bounds: BOUNDS,
    ttlSeconds: 86400,
    issuedAt: null,
    jti: null,
  });
}

export function issueCart(
  harness: Harness,
  intent: IssuedMandate,
): Promise<IssuedMandate> {
  return new CartMandateIssuer(
    harness.signer,
    harness.envelope,
    harness.merchantAuth,
    harness.clock,
  ).issue({
    merchantIss: MERCHANT_URN,
    userSub: USER_URN,
    tenantId: TENANT,
    cartId: "urn:covenant:cart:5e88",
    intentJti: intent.jti,
    intentJwtHash: intent.jwtHash,
    paymentRequest: PAYMENT_REQUEST,
    memoryDigest: MEMORY_DIGEST,
    memoryEntryIds: ["mem_0a1", "mem_9f2", "mem_3c7"],
    memoryTierFloor: "P1",
    riskData: null,
    quote: QUOTE,
    agentInstanceId: AGENT_URN,
    ttlSeconds: CART_TTL,
    issuedAt: null,
    jti: null,
  });
}

export function paymentIssuer(harness: Harness): PaymentMandateIssuer {
  return new PaymentMandateIssuer(
    harness.signer,
    harness.envelope,
    harness.userAuth,
    harness.clock,
  );
}

export function issuePaymentDraft(
  harness: Harness,
  intent: IssuedMandate,
  cart: IssuedMandate,
): Promise<PaymentMandateDraft> {
  return paymentIssuer(harness).issueDraft({
    userSub: USER_URN,
    tenantId: TENANT,
    paymentId: "urn:covenant:payment:a904",
    cartJti: cart.jti,
    cartJwtHash: cart.jwtHash,
    intentMandateHash: `sha256:${intent.jwtHash}`,
    memoryDigest: MEMORY_DIGEST,
    amount: 189900,
    currency: "INR",
    merchantId: MERCHANT_URN,
    paymentToken: "pt_9f2c",
    agentInstanceId: AGENT_URN,
    verdicts: ALL_PASS,
    executeNotBefore: "2026-08-31T10:03:00.000Z",
    envelopeReservationId: "rsv_env_77aa",
    ttlSeconds: CART_TTL,
    issuedAt: null,
    jti: null,
  });
}

/** The §6.5 two-phase flow, end to end: draft → user signs hashes → final. */
export async function issuePaymentFinal(
  harness: Harness,
  intent: IssuedMandate,
  cart: IssuedMandate,
): Promise<{ draft: PaymentMandateDraft; final: IssuedMandate }> {
  const draft = await issuePaymentDraft(harness, intent, cart);
  const userAuthorization = await harness.userAuth.issue({
    userIss: USER_URN,
    hashes: {
      cart_mandate_hash: `sha256:${cart.jwtHash}`,
      payment_mandate_body_hash: draft.bodyHash,
      memory_digest: MEMORY_DIGEST,
    },
    amount: 189900,
    currency: "INR",
    issuedAt: draft.issuedAt,
    ttlSeconds: 600,
  });
  const final = await paymentIssuer(harness).issueFinal(
    draft,
    userAuthorization,
  );
  return { draft, final };
}
