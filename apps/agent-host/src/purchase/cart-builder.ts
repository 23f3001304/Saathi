import type { CatalogSku, IssuedQuote } from "@covenant/agents";
import type {
  Clock,
  IdGenerator,
  IntentBounds,
  PaymentRequest,
  ReasonCode,
  Sha256Hex,
  TierLabel,
} from "@covenant/domain";
import {
  cartLinesOf,
  cartTotalOf,
  currencyMatches,
  merchantAllowed,
  refundabilitySatisfied,
  skusAllowed,
  withinCap,
} from "@covenant/domain";
import type { CartMandateIssuer, IssuedMandate } from "@covenant/mandates";

import { paymentRequestFor } from "./payment-request.js";

/** Long enough for a human to read the proposal, short enough to expire. */
const CART_TTL_SECONDS = 900;

export interface CartRequest {
  readonly sku: CatalogSku;
  readonly quote: IssuedQuote;
  readonly bounds: IntentBounds;
  readonly intentJti: string;
  readonly intentJwtHash: Sha256Hex;
  readonly memoryDigest: string;
  readonly memoryEntryIds: readonly string[];
  readonly memoryTierFloor: TierLabel;
  readonly tenantId: string;
  readonly userSub: string;
  readonly merchantIss: string;
  readonly agentInstanceId: string;
}

export interface AssembledCart {
  readonly mandate: IssuedMandate;
  readonly paymentRequest: PaymentRequest;
  readonly totalPaise: number;
  readonly cartId: string;
}

export type CartAssembly =
  | { readonly ok: true; readonly cart: AssembledCart }
  | { readonly ok: false; readonly reasonCode: ReasonCode };

/**
 * The five §8.4-check-1 predicates the agent can evaluate for itself, run
 * *before* asking anyone to sign. The gateway runs them again and its answer is
 * the one that counts — but a fiduciary that knowingly proposes a cart its own
 * user's mandate forbids has already failed, even when the gateway would have
 * caught it. This is also where the T-1 waiver dies: the poisoned listing said
 * refundability was waived, the signed intent says otherwise, and the signed
 * intent is the only thing being read here.
 */
function boundsFailure(
  bounds: IntentBounds,
  paymentRequest: PaymentRequest,
  merchantIss: string,
): ReasonCode | null {
  const total = cartTotalOf(paymentRequest);
  if (!currencyMatches(bounds, total)) {
    return "CURRENCY_MISMATCH";
  }
  if (!withinCap(bounds, total)) {
    return "CART_EXCEEDS_INTENT_CAP";
  }
  if (!merchantAllowed(bounds, merchantIss)) {
    return "MERCHANT_NOT_ALLOWED";
  }
  if (!skusAllowed(bounds, cartLinesOf(paymentRequest))) {
    return "SKU_NOT_ALLOWED";
  }
  return refundabilitySatisfied(bounds, paymentRequest)
    ? null
    : "REFUNDABILITY_REQUIRED";
}

/**
 * DECISION: agent-host assembles the cart here rather than through
 * `CartAssembler` from `@covenant/agents`. Why: that class takes a concrete
 * `ReadGate`, which is a SQLite-backed collaborator this process does not and
 * must not have — the agent reads memory over the gateway's HTTP route, which
 * is the whole point of the trust split. The bounds predicates and the issuer
 * are the same ones `CartAssembler` composes; only the retrieval differs.
 */
export class CartBuilder {
  constructor(
    private readonly issuer: CartMandateIssuer,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async assemble(request: CartRequest): Promise<CartAssembly> {
    const cartId = `urn:covenant:cart:${this.ids.uuid()}`;
    const paymentRequest = paymentRequestFor(request.sku, request.quote, cartId);
    const failure = boundsFailure(
      request.bounds,
      paymentRequest,
      request.merchantIss,
    );
    if (failure !== null) {
      return { ok: false, reasonCode: failure };
    }
    return {
      ok: true,
      cart: {
        cartId,
        paymentRequest,
        totalPaise: cartTotalOf(paymentRequest).paise,
        mandate: await this.issue(request, paymentRequest, cartId),
      },
    };
  }

  private issue(
    request: CartRequest,
    paymentRequest: PaymentRequest,
    cartId: string,
  ): Promise<IssuedMandate> {
    return this.issuer.issue({
      merchantIss: request.merchantIss,
      userSub: request.userSub,
      tenantId: request.tenantId,
      cartId,
      intentJti: request.intentJti,
      intentJwtHash: request.intentJwtHash,
      paymentRequest,
      memoryDigest: request.memoryDigest,
      memoryEntryIds: [...request.memoryEntryIds],
      memoryTierFloor: request.memoryTierFloor,
      riskData: null,
      quote: request.quote.ref,
      agentInstanceId: request.agentInstanceId,
      ttlSeconds: CART_TTL_SECONDS,
      issuedAt: this.clock.now(),
      jti: null,
    });
  }
}
