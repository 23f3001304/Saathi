import type {
  CatalogSku,
  IssuedQuote,
  MemoryRetrieveResponse,
} from "@covenant/agents";

import { announceCart, refuseCart } from "./cart-step.js";
import type { SignedIntent } from "./intent-flow.js";
import type { PurchaseResult } from "./purchase-result.js";
import type { RunnerConfig, RunnerParts } from "./runner-parts.js";
import { PurchaseFailed } from "./tool-fallback.js";

export interface Proposal {
  readonly result: PurchaseResult;
  readonly intent: SignedIntent;
  readonly sku: CatalogSku;
  readonly quote: IssuedQuote;
}

/**
 * The cart, assembled against the signed intent and nothing else.
 *
 * Split out of `PurchaseRunner` so the runner reads as the order of the run.
 * Nothing about the money path moved with it: the bounds come from the mandate,
 * the digest from the retrieval, and a cart the intent does not permit is
 * refused here before the gateway is ever asked.
 */
export async function proposeCart(
  parts: RunnerParts,
  config: RunnerConfig,
  proposal: Proposal,
): Promise<PurchaseResult> {
  const { result, intent, sku, quote } = proposal;
  const assembly = await parts.carts.assemble({
    sku,
    quote,
    bounds: intent.bounds,
    intentJti: intent.mandate.jti,
    intentJwtHash: intent.mandate.jwtHash,
    memoryDigest: result.memoryDigest ?? "",
    memoryEntryIds: result.memoryEntryIds,
    memoryTierFloor: "P1",
    tenantId: config.tenantId,
    userSub: intent.mandate.payload.sub,
    merchantIss: config.merchantIss,
    agentInstanceId: config.agentInstanceId,
  });
  if (!assembly.ok) {
    return refuseCart(parts.hub, parts.logger, result, assembly.reasonCode);
  }
  announceCart(parts.hub, assembly.cart, result.memoryDigest);
  await parts.cartGate.wait();
  return await parts.settlement.settle({
    result,
    intent,
    sku,
    quote,
    cart: assembly.cart,
  });
}

/**
 * What the cart is evidence *about*: the listing and the merchant's signed
 * quote for it. Short and exact on purpose — the ranker scores an entry by the
 * share of query tokens it contains, so a long sentence dilutes the one row
 * that must be found.
 */
function evidenceQuery(sku: CatalogSku, quote: IssuedQuote): string {
  return `${sku.sku} ${quote.claims.quote_jti}`;
}

/**
 * The `cart-construction` retrieval whose digest the Cart Mandate binds.
 *
 * DECISION: it is queried with the evidence, not with the shopper's sentence.
 * The gateway resolves the P2 signed quote *from the entries this cart names*,
 * so if the quote is not among them the cart is `CART_QUOTE_MISMATCH` however
 * right its total is. Querying with the request returned thirty-two turns of
 * conversation and not one fact: the ranker's lexical fallback was scoring the
 * request against rows whose content is the request. It survived on the fixture
 * shelf only because `ST-KURTA-NAVY-M` shares words with a sentence about navy
 * kurtas — a live Razorpay id shares none, so every live cart failed.
 */
export async function retrieveForCart(
  parts: RunnerParts,
  config: RunnerConfig,
  evidence: { readonly sku: CatalogSku; readonly quote: IssuedQuote },
): Promise<MemoryRetrieveResponse> {
  const retrieved = await parts.gateway.retrieveMemory({
    query: evidenceQuery(evidence.sku, evidence.quote),
    action_class: "cart-construction",
    limit: config.retrieveLimit,
    as_of: null,
    user_id: config.userId,
  });
  if (!retrieved.ok) {
    throw new PurchaseFailed(
      `memory retrieval refused: ${retrieved.failure.reasonCode}`,
    );
  }
  return retrieved.value;
}
