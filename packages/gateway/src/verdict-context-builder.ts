import type {
  CartMandate,
  Clock,
  IntentMandate,
  MemoryEntry,
  MemoryStore,
  NonceRegistry,
  Sha256Hex,
} from "@covenant/domain";
import { cartLinesOf, cartTotalOf, declaredTotalOf } from "@covenant/domain";
import { cartHashOf } from "@covenant/mandates";

import { activeBlackout } from "./blackout-window.js";
import {
  readCredentialContexts,
  readMerchantAuthCartHash,
} from "./credential-facts.js";
import { computeDigest } from "./memory-digest.js";
import type { PriceFloorStore } from "./sql/price-floors.js";
import { resolveSignedQuote } from "./signed-quote-resolver.js";
import type { SpendWindow } from "./sql/spend-window.js";
import type { StockReservationManager } from "./sql/stock-reservations.js";
import type {
  MemoryEvidence,
  RiskAttestationFacts,
  VerdictContext,
} from "./verdict-context.js";

export interface GatewayPins {
  readonly pinnedUris: readonly string[];
  readonly apiVersion: string;
  readonly cancelUrlBase: string;
}

/** The async facts stage 0 established, plus the request's transport identity. */
export interface ContextRequest {
  readonly intent: IntentMandate;
  readonly cart: CartMandate;
  readonly cartJwt: string;
  readonly riskAttestation: RiskAttestationFacts;
  readonly tenantId: string;
  readonly userId: string;
  readonly requestId: string;
  readonly txnId: string;
  readonly payloadHash: Sha256Hex;
  readonly idempotencyKey: string;
}

/**
 * Assembles the frozen fact bundle from verified mandates, memory evidence,
 * nonce state and folds. Every port in the pipeline lives on this class
 * (deviation D1): the checks receive data, never collaborators, so a check that
 * wanted to do I/O has nothing to do it with.
 *
 * `build` is synchronous because it runs on the read snapshot taken inside the
 * write transaction (§8.2) and there is no `await` inside a transaction (§5.3).
 */
export class VerdictContextBuilder {
  constructor(
    private readonly memory: MemoryStore,
    private readonly nonces: NonceRegistry,
    private readonly spend: SpendWindow,
    private readonly stock: StockReservationManager,
    private readonly floors: PriceFloorStore,
    private readonly clock: Clock,
    private readonly pins: GatewayPins,
  ) {}

  build(request: ContextRequest): VerdictContext {
    const now = this.clock.now();
    const cart = request.cart;
    const evidence = this.evidenceFor(request);
    const lines = cartLinesOf(cart.payment_request);
    return {
      ...identityOf(request),
      now,
      cartContexts: readCredentialContexts(request.cartJwt),
      merchantAuth: {
        merchantIss: cart.iss,
        cartHash:
          readMerchantAuthCartHash(cart.merchant_authorization) ?? "sha256:",
      },
      cartTotal: cartTotalOf(cart.payment_request),
      declaredCartTotal: declaredTotalOf(cart.payment_request),
      cartLines: lines,
      computedCartHash: cartHashOf(cart.payment_request),
      nonceState: this.nonces.peek(cart.jti, "cart_verify"),
      memory: evidence,
      signedQuote: resolveSignedQuote(evidence.entries, cart.quote.quote_jti),
      priceFloors: this.floors.forSkus(
        request.tenantId,
        lines.map((line) => line.sku),
      ),
      stockReservation: this.stock.find(cart.quote.reservation_id),
      envelopes: this.spend.statesFor(
        { tenantId: request.tenantId, userId: request.userId },
        request.intent.envelopes,
        now,
      ),
      cooloffRule: request.intent.cooloff,
      blackout: activeBlackout(request.intent.blackout_hours, now),
      pinnedUris: this.pins.pinnedUris,
      apiVersion: this.pins.apiVersion,
      cancelUrlBase: this.pins.cancelUrlBase,
    };
  }

  /**
   * `missing` / `extra` are a set difference between the ids the cart signed
   * over and what the store returns, so a mismatch names *which belief moved*.
   */
  private evidenceFor(request: ContextRequest): MemoryEvidence {
    const signedIds = request.cart.memory_entry_ids;
    const entries = this.memory.getByIds(request.tenantId, signedIds);
    const found = new Set(entries.map((entry) => entry.id));
    const signed = new Set(signedIds);
    return {
      entries,
      recomputedDigest: computeDigest(entries),
      minTier: minTierOf(entries),
      missingIds: signedIds.filter((id) => !found.has(id)),
      extraIds: entries.map((e) => e.id).filter((id) => !signed.has(id)),
    };
  }
}

/** The fields that come straight off the request, unchanged. */
function identityOf(request: ContextRequest) {
  return {
    tenantId: request.tenantId,
    userId: request.userId,
    requestId: request.requestId,
    txnId: request.txnId,
    intent: request.intent,
    cart: request.cart,
    riskAttestation: request.riskAttestation,
    payloadHash: request.payloadHash,
    idempotencyKey: request.idempotencyKey,
  };
}

function minTierOf(entries: readonly MemoryEntry[]): 0 | 1 | 2 | 3 | null {
  return entries.reduce<0 | 1 | 2 | 3 | null>(
    (lowest, entry) =>
      lowest === null || entry.tier < lowest ? entry.tier : lowest,
    null,
  );
}
