import type { Logger, ReasonCode } from "@covenant/domain";

import type { BeatHub } from "../http/beat-hub.js";
import type { AssembledCart } from "./cart-builder.js";
import type { PurchaseResult } from "./purchase-result.js";

export function announceCart(
  hub: BeatHub,
  cart: AssembledCart,
  digest: string | null,
): void {
  hub.emit({
    kind: "cart",
    itemCount: cart.paymentRequest.details.displayItems.length,
    totalPaise: cart.totalPaise,
    // The Bench's DigestInspector renders the bare hex, not the `sha256:` ref.
    digest: (digest ?? "").replace("sha256:", ""),
    quoteOk: true,
  });
}

/**
 * A refusal here is the covenant working, so the agent says so in the user's
 * words and stops. It does not "try a smaller cart": the bound it just hit was
 * not a budget to spend around, and quietly retrying under it is how an agent
 * turns a refusal into a negotiation with its own principal.
 */
/**
 * The reason a cart was refused, in words. The code is the ledger's name for
 * it and stays in the ledger: printed in the conversation it said
 * "MERCHANT_NOT_ALLOWED" twice in two sentences, which tells a shopper nothing
 * they did not already know and everything about our enum.
 */
const REFUSAL_SENTENCE: Partial<Record<ReasonCode, string>> = {
  MERCHANT_NOT_ALLOWED:
    "this shop is not one your covenant allows me to buy from",
  SKU_NOT_ALLOWED: "this product is not one your covenant covers",
  CART_EXCEEDS_INTENT_CAP: "the total is above the ceiling you signed",
  CURRENCY_MISMATCH: "it is priced in a currency your covenant does not cover",
  ENVELOPE_EXCEEDED: "this category's budget for the month is already spent",
  REFUNDABILITY_REQUIRED: "it is not refundable, and you asked that it be",
  QUOTE_EXPIRED: "the merchant's signed quote has expired",
  CART_QUOTE_MISMATCH: "the total does not match the quote the merchant signed",
  QUOTE_BELOW_FLOOR:
    "the price is below the lowest this shop signed for, so it is not theirs to give",
};

function refusalText(reasonCode: string): string {
  const because = REFUSAL_SENTENCE[reasonCode as ReasonCode];
  if (because === undefined) {
    return "I will not propose this cart: it conflicts with the rules you signed.";
  }
  return `I will not propose this cart: ${because}.`;
}

export function refuseCart(
  hub: BeatHub,
  logger: Logger,
  result: PurchaseResult,
  reasonCode: string,
): PurchaseResult {
  logger.warn("cart.refused", { reason_code: reasonCode });
  hub.emit({
    kind: "message",
    text: refusalText(reasonCode),
    variant: "system",
  });
  hub.emit({
    kind: "outcome",
    state: "bounded",
    txnId: null,
    detail: "",
  });
  return { ...result, status: "bounded", cartRefusal: reasonCode };
}
