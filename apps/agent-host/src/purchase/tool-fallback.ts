import type {
  CatalogSku,
  IssuedQuote,
  PreToolUseHook,
  ToolCall,
  ToolDispatcher,
} from "@covenant/agents";
import {
  CATALOG_TOOL_NAME,
  MERCHANT_TOOL_SERVER,
  QUOTE_TOOL_NAME,
} from "@covenant/agents";
import type { Logger } from "@covenant/domain";
import { askUnitPaise } from "@covenant/domain";

import type { ToolLog } from "./tool-log.js";

export class PurchaseFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseFailed";
  }
}

const CATALOG_LIMIT = 8;

/** This flow buys one of a thing; the band arithmetic is per unit regardless. */
const QTY = 1;

/**
 * The live SDK adapter runs the tool loop itself, so `BuyerAgent` is handed no
 * pending calls to approve and a live run can reach cart assembly with nothing
 * quoted. This is the harness taking the two merchant steps on its own behalf.
 *
 * It still goes through `PreToolUseHook`. A call the harness makes is judged
 * exactly like one the model asked for — otherwise F2 would hold only on the
 * path nobody takes, which is the same as not holding.
 */
export class MerchantToolFallback {
  constructor(
    private readonly hook: PreToolUseHook,
    private readonly dispatcher: ToolDispatcher,
    private readonly log: ToolLog,
    private readonly logger: Logger,
  ) {}

  async ensureQuote(sku: CatalogSku, capPaise: number): Promise<IssuedQuote> {
    if (this.log.listings.length === 0) {
      await this.gated({
        tool: CATALOG_TOOL_NAME,
        server: MERCHANT_TOOL_SERVER,
        args: {
          query: sku.category,
          max_price_paise: null,
          limit: CATALOG_LIMIT,
        },
      });
    }
    if (this.log.quote === null) {
      await this.gated(this.quoteCall(sku, capPaise));
    }
    const quote = this.log.quote;
    if (quote === null) {
      throw new PurchaseFailed("the merchant issued no signed quote");
    }
    return quote;
  }

  /**
   * The whole negotiation: **one** quote request, and the price in it is
   * arithmetic over two signed numbers — the ceiling the buyer signed and the
   * floor the merchant published. No model proposes it, so there is nothing to
   * talk into a second round, and there is no round to manufacture urgency in.
   *
   * The ask is the *least* intrusion into the band that clears the ceiling,
   * not the floor itself. A buyer who needs 1800 and could have had 1700 asks
   * for 1800: the band is the merchant's permission, not the buyer's budget,
   * and taking all of it every time would make every published floor the only
   * price that shop ever sells at.
   *
   * `null` asks for nothing, and the merchant signs at list — which is what
   * happens both when the listing already fits and when no floor was declared,
   * because a shelf row with no discount authority reports its floor as its
   * list price and there is no ask that can help.
   */
  private quoteCall(sku: CatalogSku, capPaise: number): ToolCall {
    const ask = askUnitPaise({
      listPaise: sku.listPricePaise,
      floorPaise: sku.floorPricePaise,
      capPaise,
      qty: QTY,
    });
    this.logger.info("negotiation.ask", {
      sku: sku.sku,
      list_paise: sku.listPricePaise,
      floor_paise: sku.floorPricePaise,
      cap_paise: capPaise,
      ask_paise: ask,
    });
    return {
      tool: QUOTE_TOOL_NAME,
      server: MERCHANT_TOOL_SERVER,
      args: { sku: sku.sku, qty: QTY, target_unit_paise: ask },
    };
  }

  private async gated(call: ToolCall): Promise<void> {
    const decision = this.hook.evaluate(call, null);
    if (!decision.allowed) {
      throw new PurchaseFailed(decision.human ?? decision.reason);
    }
    await this.dispatcher.dispatch(call);
  }
}
