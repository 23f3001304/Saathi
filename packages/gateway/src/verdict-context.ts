import type {
  BlackoutWindow,
  CartLine,
  CartMandate,
  CooloffRule,
  EnvelopeState,
  IntentMandate,
  MandateRole,
  MemoryEntry,
  Money,
  NonceState,
  Sha256Hex,
  Sha256Ref,
  SignedQuote,
  SkuPriceFloor,
  StockReservationState,
  Tier,
} from "@covenant/domain";

/**
 * What the inner AP2 `merchant_authorization` established (§6.6). The gateway
 * keeps the value it verified rather than re-reading the cart body, so
 * `QuoteMatchCheck` compares three independently sourced hashes, not two.
 */
export interface MerchantAuthorizationFacts {
  readonly merchantIss: string;
  readonly cartHash: Sha256Ref;
}

/**
 * The digest recomputation and the set difference against the signed id list,
 * so `MemoryDigestCheck` can say *which belief moved* rather than only that
 * something did (§8.4 check 5).
 */
export interface MemoryEvidence {
  readonly entries: readonly MemoryEntry[];
  readonly recomputedDigest: Sha256Ref;
  readonly minTier: Tier | null;
  readonly missingIds: readonly string[];
  readonly extraIds: readonly string[];
}

/**
 * The result of verifying `risk_data.attestation` against the pinned trust
 * ring. Verification is I/O-shaped (async, key resolution), so it is resolved
 * into a fact here and never performed by a check (deviation D1).
 */
export interface RiskAttestationFacts {
  readonly signatureValid: boolean;
  readonly signerRole: MandateRole | null;
  readonly payloadHashMatches: boolean;
}

export const NO_RISK_ATTESTATION: RiskAttestationFacts = {
  signatureValid: false,
  signerRole: null,
  payloadHashMatches: false,
};

/**
 * The frozen, read-only fact bundle every check sees (§8.2). A check that
 * needed to perform I/O would be a design error, and there is no port on this
 * type to make it possible — deviation D1 puts the bundle in `gateway` and
 * keeps every port on `VerdictContextBuilder`.
 */
export interface VerdictContext {
  /** From the injected `Clock`; never `Date.now()`. */
  readonly now: Date;
  readonly tenantId: string;
  readonly userId: string;
  readonly requestId: string;
  readonly txnId: string;

  readonly intent: IntentMandate;
  readonly cart: CartMandate;
  /** `@context` of the cart credential, carried through unjudged for the pin. */
  readonly cartContexts: readonly string[];
  readonly merchantAuth: MerchantAuthorizationFacts;

  /** Recomputed from `payment_request`, never read from `details.total`. */
  readonly cartTotal: Money;
  readonly cartLines: readonly CartLine[];
  readonly computedCartHash: Sha256Ref;
  readonly declaredCartTotal: Money;

  readonly nonceState: NonceState | null;
  readonly payloadHash: Sha256Hex;
  readonly idempotencyKey: string;

  readonly memory: MemoryEvidence;
  readonly riskAttestation: RiskAttestationFacts;
  readonly signedQuote: SignedQuote | null;
  /** The bands the merchant signed for this cart's SKUs, resolved from the
   *  gateway's own store — never from the quote being checked. */
  readonly priceFloors: readonly SkuPriceFloor[];
  readonly stockReservation: StockReservationState | null;

  readonly envelopes: readonly EnvelopeState[];
  readonly cooloffRule: CooloffRule | null;
  readonly blackout: BlackoutWindow | null;

  readonly pinnedUris: readonly string[];
  readonly apiVersion: string;
  /** Base for the cool-off `cancel_url` in `to_pass` (§4.1). */
  readonly cancelUrlBase: string;
}

export function envelopeFor(
  context: VerdictContext,
  category: string,
): EnvelopeState | null {
  return (
    context.envelopes.find((envelope) => envelope.category === category) ?? null
  );
}
