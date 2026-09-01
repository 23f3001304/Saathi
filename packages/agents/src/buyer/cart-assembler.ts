import type {
  CartQuoteRef,
  Clock,
  IntentBounds,
  PaymentRequest,
  ReasonCode,
  RiskData,
  Sha256Hex,
} from "@covenant/domain";
import {
  cartLinesOf,
  cartTotalOf,
  currencyMatches,
  merchantAllowed,
  refundabilitySatisfied,
  skusAllowed,
  tierLabel,
  withinCap,
} from "@covenant/domain";
import type { CartMandateIssuer, IssuedMandate } from "@covenant/mandates";
import type { ReadGate } from "@covenant/memory";

export const CART_ACTION_CLASS = "cart-construction";

export interface CartAssemblyRequest {
  readonly merchantIss: string;
  readonly merchantId: string;
  readonly userSub: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly cartId: string;
  readonly intentJti: string;
  readonly intentJwtHash: Sha256Hex;
  readonly bounds: IntentBounds;
  readonly paymentRequest: PaymentRequest;
  readonly quote: CartQuoteRef;
  readonly riskData: RiskData | null;
  readonly agentInstanceId: string;
  readonly retrievalQuery: string;
  readonly ttlSeconds: number;
}

export interface AssembledCart {
  readonly mandate: IssuedMandate;
  /** The entries the gateway will recompute the digest from (§8.4 check 5). */
  readonly memoryEntryIds: readonly string[];
  readonly memoryDigest: string;
  readonly retrievalEventId: string;
}

export type CartAssembly =
  | { readonly ok: true; readonly cart: AssembledCart }
  | { readonly ok: false; readonly reasonCode: ReasonCode };

/** The seven §8.4-check-1 predicates, run *before* asking anyone to sign. */
function boundsFailure(
  bounds: IntentBounds,
  request: CartAssemblyRequest,
): ReasonCode | null {
  const total = cartTotalOf(request.paymentRequest);
  const lines = cartLinesOf(request.paymentRequest);
  if (!currencyMatches(bounds, total)) {
    return "CURRENCY_MISMATCH";
  }
  if (!withinCap(bounds, total)) {
    return "CART_EXCEEDS_INTENT_CAP";
  }
  if (!merchantAllowed(bounds, request.merchantId)) {
    return "MERCHANT_NOT_ALLOWED";
  }
  if (!skusAllowed(bounds, lines)) {
    return "SKU_NOT_ALLOWED";
  }
  return refundabilitySatisfied(bounds, request.paymentRequest)
    ? null
    : "REFUNDABILITY_REQUIRED";
}

/**
 * Builds the W3C PaymentRequest into a merchant-signed Cart Mandate, with the
 * `cart-construction` retrieval's digest and entry ids bound in.
 *
 * The bounds are checked here as well as at the gateway on purpose: a
 * fiduciary agent that knowingly proposes a cart its own user's mandate
 * forbids has already failed, even when the gateway would have caught it.
 */
export class CartAssembler {
  constructor(
    private readonly readGate: ReadGate,
    private readonly issuer: CartMandateIssuer,
    private readonly clock: Clock,
  ) {}

  async assemble(request: CartAssemblyRequest): Promise<CartAssembly> {
    const failure = boundsFailure(request.bounds, request);
    if (failure !== null) {
      return { ok: false, reasonCode: failure };
    }
    return { ok: true, cart: await this.issueCart(request) };
  }

  private async issueCart(
    request: CartAssemblyRequest,
  ): Promise<AssembledCart> {
    const retrieval = await this.readGate.retrieve({
      tenantId: request.tenantId,
      userId: request.userId,
      query: request.retrievalQuery,
      actionClass: CART_ACTION_CLASS,
      limit: 12,
      asOf: null,
    });
    const memoryEntryIds = retrieval.entries.map((entry) => entry.id);
    const mandate = await this.issuer.issue({
      merchantIss: request.merchantIss,
      userSub: request.userSub,
      tenantId: request.tenantId,
      cartId: request.cartId,
      intentJti: request.intentJti,
      intentJwtHash: request.intentJwtHash,
      paymentRequest: request.paymentRequest,
      memoryDigest: retrieval.digest ?? "",
      memoryEntryIds,
      memoryTierFloor: tierLabel(retrieval.tierFloor),
      riskData: request.riskData,
      quote: request.quote,
      agentInstanceId: request.agentInstanceId,
      ttlSeconds: request.ttlSeconds,
      issuedAt: this.clock.now(),
      jti: null,
    });
    return {
      mandate,
      memoryEntryIds,
      memoryDigest: retrieval.digest ?? "",
      retrievalEventId: retrieval.eventId,
    };
  }
}
