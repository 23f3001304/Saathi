import type { Logger } from "@covenant/domain";

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
 * A refusal here is the covenant working, so the run stops: it does not "try a
 * smaller cart", because the bound it just hit was not a budget to spend
 * around. What the refusal means is said by the model (`explainRefusal`),
 * never by a fixed table here; this only records it and closes the beat.
 */
export function refuseCart(
  hub: BeatHub,
  logger: Logger,
  result: PurchaseResult,
  reasonCode: string,
): PurchaseResult {
  logger.warn("cart.refused", { reason_code: reasonCode });
  hub.emit({ kind: "outcome", state: "bounded", txnId: null, detail: "" });
  return { ...result, status: "bounded", cartRefusal: reasonCode };
}
