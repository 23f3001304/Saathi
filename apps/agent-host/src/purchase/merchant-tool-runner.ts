import type {
  CatalogListing,
  CatalogMemoryWriter,
  IssuedQuote,
  MerchantAgent,
  ToolCall,
  ToolEnvelopeSigner,
  ToolOutcome,
} from "@covenant/agents";
import {
  CATALOG_TOOL_NAME,
  isMerchantRefusal,
  QUOTE_TOOL_NAME,
} from "@covenant/agents";

import type { CatalogArgs, QuoteArgs } from "./tool-args.js";
import type { ToolLog } from "./tool-log.js";

function json(payload: unknown, isError: boolean): ToolOutcome {
  return { content: JSON.stringify(payload), isError };
}

/** A merchant refusal ends the round; an envelope failure is the caller's to
 *  fix and may legitimately be retried with a correct signature. */
function refused(failure: string): ToolOutcome {
  return {
    content: JSON.stringify({ ok: false, failure }),
    isError: true,
    ...(isMerchantRefusal(failure) ? { terminal: true } : {}),
  };
}

/**
 * The merchant side of the tool surface, plus the PTLM write each result earns
 * (§7.1). A listing lands as P0 `untrusted_text` — quarantined, and therefore
 * safe to carry at all; a signed quote lands as P2 `merchant_attestation`,
 * which is what makes the number the gateway will later hold the cart to.
 *
 * Every call is wrapped in an AM2 envelope over the *exact* call the merchant
 * will reconstruct, so an argument rewritten between signing and dispatch comes
 * back as `args_tampered` rather than as a quote for something else.
 */
export class MerchantToolRunner {
  constructor(
    private readonly agent: MerchantAgent,
    private readonly envelopes: ToolEnvelopeSigner,
    private readonly memory: CatalogMemoryWriter,
    private readonly log: ToolLog,
    private readonly server: string,
    private readonly merchantId: string,
  ) {}

  async search(args: CatalogArgs): Promise<ToolOutcome> {
    const jws = await this.envelopeFor(CATALOG_TOOL_NAME, { ...args });
    const result = await this.agent.search(jws, args);
    if (!result.ok) {
      return json({ ok: false, failure: result.failure }, true);
    }
    this.log.recordListings(result.data);
    await this.rememberListings(result.data);
    return json({ ok: true, listings: result.data }, false);
  }

  async quote(args: QuoteArgs): Promise<ToolOutcome> {
    const jws = await this.envelopeFor(QUOTE_TOOL_NAME, { ...args });
    const result = await this.agent.quote(jws, args);
    if (!result.ok) {
      return refused(result.failure);
    }
    this.log.recordQuote(result.data);
    await this.rememberQuote(result.data);
    return json({ ok: true, quote: result.data.claims }, false);
  }

  private envelopeFor(
    tool: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<string> {
    const call: ToolCall = { tool, server: this.server, args };
    return this.envelopes.sign(call).then((signed) => signed.jws);
  }

  private async rememberListings(
    listings: readonly CatalogListing[],
  ): Promise<void> {
    for (const listing of listings) {
      const written = await this.memory.writeCatalogFact({
        sku: listing.sku,
        merchantId: this.merchantId,
        description: listing.description.value,
        pricePaise: listing.list_price_paise,
        currency: listing.currency,
      });
      if (written.ok) {
        this.log.recordWrite({
          type: "fact",
          tierClaim: "P0",
          channel: "untrusted_text",
          body: written.value,
        });
      }
    }
  }

  private async rememberQuote(quote: IssuedQuote): Promise<void> {
    const written = await this.memory.writeQuoteFact({
      sku: quote.claims.sku_id,
      merchantId: this.merchantId,
      quoteJti: quote.claims.quote_jti,
      totalPaise: quote.claims.total_paise,
      askedUnitPaise: quote.claims.asked_unit_paise,
      currency: quote.claims.currency,
      expiry: quote.claims.quote_expiry,
      reservationId: quote.claims.reservation_id,
      attestation: quote.jws,
    });
    if (written.ok) {
      this.log.recordWrite({
        type: "fact",
        tierClaim: "P2",
        channel: "merchant_attestation",
        body: written.value,
      });
    }
  }
}
