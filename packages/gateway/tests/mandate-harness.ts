import type { RiskData } from "@covenant/domain";
import type { GeneratedKeyMaterial, IssuedMandate } from "@covenant/mandates";
import {
  CartMandateIssuer,
  CredentialEnvelope,
  Es256Signer,
  Es256Verifier,
  IntentMandateIssuer,
  KeyStore,
  MandateChainBinder,
  MandateChainVerifier,
  MerchantAuthorization,
  PaymentMandateIssuer,
  PinnedJwkResolver,
  UserAuthorization,
  generateKeyMaterial,
} from "@covenant/mandates";

import { CountingIds, FixedClock } from "./fakes.js";
import {
  AGENT_URN,
  BOUNDS,
  GOLDEN_ENTRIES,
  ISSUERS,
  MERCHANT_URN,
  NOW,
  PAYMENT_REQUEST,
  QUOTE,
  TENANT,
  USER_URN,
} from "./fixtures.js";
import { computeDigest } from "../src/index.js";

export const CART_TTL_SECONDS = 900;

export interface Crypto {
  readonly material: GeneratedKeyMaterial;
  readonly clock: FixedClock;
  readonly ids: CountingIds;
  readonly signer: Es256Signer;
  readonly verifier: Es256Verifier;
  readonly chain: MandateChainVerifier;
  readonly intents: IntentMandateIssuer;
  readonly carts: CartMandateIssuer;
  readonly payments: PaymentMandateIssuer;
}

/** Real ES256 keys and real signatures — the suite mocks no crypto anywhere. */
export async function buildCrypto(clock: FixedClock): Promise<Crypto> {
  const material = await generateKeyMaterial(ISSUERS, NOW);
  const ids = new CountingIds();
  const signer = new Es256Signer(new KeyStore(material.privateKeys));
  const resolver = new PinnedJwkResolver(material.trustRing, clock);
  const verifier = new Es256Verifier(resolver, clock);
  const envelope = new CredentialEnvelope(clock, ids);
  const merchantAuth = new MerchantAuthorization(signer, verifier, ids);
  const userAuth = new UserAuthorization(signer, verifier, ids);
  return {
    material,
    clock,
    ids,
    signer,
    verifier,
    chain: new MandateChainVerifier(
      verifier,
      new MandateChainBinder(),
      merchantAuth,
    ),
    intents: new IntentMandateIssuer(signer, envelope),
    carts: new CartMandateIssuer(signer, envelope, merchantAuth, clock),
    payments: new PaymentMandateIssuer(signer, envelope, userAuth, clock),
  };
}

export function issueIntent(
  crypto: Crypto,
  bounds = BOUNDS,
  issuedAt: Date = NOW,
): Promise<IssuedMandate> {
  return crypto.intents.issue({
    userIss: USER_URN,
    tenantId: TENANT,
    naturalLanguageDescription:
      "Buy one pair of running shoes under Rs 2,000, refundable, from Kolam Run.",
    agentInstanceId: AGENT_URN,
    bounds,
    ttlSeconds: 86400,
    issuedAt,
    jti: null,
  });
}

export interface CartOptions {
  readonly paymentRequest?: typeof PAYMENT_REQUEST;
  readonly riskData?: RiskData | null;
  readonly memoryDigest?: string;
  readonly quote?: typeof QUOTE;
  readonly issuedAt?: Date;
}

export function issueCart(
  crypto: Crypto,
  intent: IssuedMandate,
  options: CartOptions = {},
): Promise<IssuedMandate> {
  return crypto.carts.issue({
    merchantIss: MERCHANT_URN,
    userSub: USER_URN,
    tenantId: TENANT,
    cartId: `urn:covenant:cart:${crypto.ids.uuid()}`,
    intentJti: intent.jti,
    intentJwtHash: intent.jwtHash,
    paymentRequest: options.paymentRequest ?? PAYMENT_REQUEST,
    memoryDigest: options.memoryDigest ?? computeDigest(GOLDEN_ENTRIES),
    memoryEntryIds: GOLDEN_ENTRIES.map((entry) => entry.id),
    memoryTierFloor: "P1",
    riskData: options.riskData ?? null,
    quote: options.quote ?? QUOTE,
    agentInstanceId: AGENT_URN,
    ttlSeconds: CART_TTL_SECONDS,
    issuedAt: options.issuedAt ?? NOW,
    jti: null,
  });
}
