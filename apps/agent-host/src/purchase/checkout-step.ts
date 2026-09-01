import type { CatalogSku, Checkout, IssuedQuote } from "@covenant/agents";

import type { BeatHub } from "../http/beat-hub.js";
import type { AssembledCart } from "./cart-builder.js";
import type { AuditView, GatewayReader } from "./gateway-reader.js";
import { sealSummary } from "./gateway-reader.js";
import type { SignedIntent } from "./intent-flow.js";
import type { PurchaseResult } from "./purchase-result.js";
import { settlementOf } from "./settlement.js";

export interface CheckoutInput {
  readonly result: PurchaseResult;
  readonly intent: SignedIntent;
  readonly cart: AssembledCart;
  readonly sku: CatalogSku;
  readonly quote: IssuedQuote;
}

/**
 * verify-cart → (execute-payment) → read the seals back out of the gateway's
 * own audit chain. The last step is deliberate: an agent quoting its own copy
 * of a verdict is an agent quoting itself, and R10 says the audit trail comes
 * from the verifier. `chain_ok` rides along, so "eight seals passed" is a claim
 * with a hash walk behind it.
 */
export class CheckoutStep {
  constructor(
    private readonly checkout: Checkout,
    private readonly reader: GatewayReader,
    private readonly hub: BeatHub,
  ) {}

  async settle(input: CheckoutInput): Promise<PurchaseResult> {
    const outcome = await this.checkout.run({
      cartMandateJwt: input.cart.mandate.jwt,
      intentMandateJwt: input.intent.mandate.jwt,
      memoryEntryIds: input.result.memoryEntryIds,
    });
    const settlement = settlementOf(outcome);
    const audit = await this.auditFor(settlement.txnId);
    this.hub.emit(settlement.beat);
    return {
      ...input.result,
      outcome,
      status: settlement.status,
      verdicts: audit === null ? [] : audit.verdicts,
      chainOk: audit === null ? null : audit.chain_ok,
      cart: {
        cartId: input.cart.cartId,
        cartMandateId: input.cart.mandate.jti,
        totalPaise: input.cart.totalPaise,
        sku: input.sku.sku,
        quoteJti: input.quote.claims.quote_jti,
      },
    };
  }

  private async auditFor(txnId: string | null): Promise<AuditView | null> {
    if (txnId === null) {
      return null;
    }
    const audit = await this.reader.audit(txnId);
    if (audit === null) {
      return null;
    }
    const { seals, passed } = sealSummary(audit.verdicts);
    this.hub.emit({
      kind: "verdict",
      decision: seals > 0 && passed === seals ? "approve" : "reject",
      txnId,
      seals,
      passed,
    });
    return audit;
  }
}
