import type { Logger } from "@covenant/domain";

import type { ToolCall } from "../shared/tool-envelope.js";
import type { ToolEnvelopeVerifier } from "../shared/tool-envelope-verifier.js";
import type {
  CatalogListing,
  CatalogSearchArgs,
  CatalogTool,
} from "./catalog-tool.js";
import { CATALOG_TOOL_NAME } from "./catalog-tool.js";
import type { MerchantToolResult } from "./merchant-tool-result.js";
import type { IssuedQuote, QuoteRequestArgs, QuoteTool } from "./quote-tool.js";
import { QUOTE_TOOL_NAME } from "./quote-tool.js";

export interface MerchantAgentConfig {
  readonly server: string;
  /** Re-quotes per SKU **within one run**; a merchant farmed forever is a
   *  merchant. See `newRun` for why the window is a run and not a process. */
  readonly maxQuotesPerSku: number;
}

/**
 * Hosts the merchant tools and the negotiation policy. It never touches the
 * ledger: the merchant's word about what happened is not evidence, and the one
 * artifact it produces that *is* evidence — the signed quote — is verified by
 * the gateway rather than asserted here.
 */
export class MerchantAgent {
  private readonly quoteCounts = new Map<string, number>();

  /**
   * A new run, and a fresh quota.
   *
   * The count used to live for the life of the process, so the fifth purchase
   * of the same SKU — a different shopper, a different conversation, an hour
   * later — was refused `rounds_exhausted` and the run died with "the merchant
   * issued no signed quote". Four rounds is a bound on one negotiation, which
   * is the thing that can be farmed; a shop that will not sell the same shirt
   * twice is not protecting itself from anything.
   */
  newRun(): void {
    this.quoteCounts.clear();
  }

  constructor(
    private readonly catalogTool: CatalogTool,
    private readonly quoteTool: QuoteTool,
    private readonly verifier: ToolEnvelopeVerifier,
    private readonly logger: Logger,
    private readonly config: MerchantAgentConfig,
  ) {}

  search(
    envelopeJws: string,
    args: CatalogSearchArgs,
  ): Promise<MerchantToolResult<readonly CatalogListing[]>> {
    const call: ToolCall = {
      tool: CATALOG_TOOL_NAME,
      server: this.config.server,
      args: { ...args },
    };
    this.logger.info("merchant.catalog.search", { query: args.query });
    return this.catalogTool.search(envelopeJws, call, args);
  }

  async quote(
    envelopeJws: string,
    args: QuoteRequestArgs,
  ): Promise<MerchantToolResult<IssuedQuote>> {
    const call: ToolCall = {
      tool: QUOTE_TOOL_NAME,
      server: this.config.server,
      args: { ...args },
    };
    const verified = await this.verifier.verify(envelopeJws, call);
    if (!verified.ok) {
      this.logger.warn("merchant.envelope.rejected", {
        tool: QUOTE_TOOL_NAME,
        failure: verified.failure,
      });
      return { ok: false, failure: verified.failure };
    }
    return this.issue(args);
  }

  private async issue(
    args: QuoteRequestArgs,
  ): Promise<MerchantToolResult<IssuedQuote>> {
    if (!this.admitRound(args.sku)) {
      return { ok: false, failure: "rounds_exhausted" };
    }
    const quote = await this.quoteTool.quote(args);
    if (quote === null) {
      this.logger.warn("merchant.quote.not_stocked", { sku: args.sku });
      return { ok: false, failure: "not_stocked" };
    }
    this.logger.info("merchant.quote.issued", {
      sku: args.sku,
      total_paise: quote.claims.total_paise,
      quote_jti: quote.claims.quote_jti,
    });
    return { ok: true, data: quote };
  }

  private admitRound(sku: string): boolean {
    const used = this.quoteCounts.get(sku) ?? 0;
    if (used >= this.config.maxQuotesPerSku) {
      this.logger.warn("merchant.quote.rounds_exhausted", { sku, used });
      return false;
    }
    this.quoteCounts.set(sku, used + 1);
    return true;
  }
}
