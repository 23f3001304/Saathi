import type { ToolCall } from "../shared/tool-envelope.js";
import type { ToolEnvelopeVerifier } from "../shared/tool-envelope-verifier.js";
import type { MerchantCatalogSource } from "./catalog-source.js";
import { hits } from "./catalog-terms.js";
import type { CatalogSku } from "./demo-catalog.js";
import type {
  MerchantToolResult,
  UntrustedText,
} from "./merchant-tool-result.js";
import { untrusted } from "./merchant-tool-result.js";

export const CATALOG_TOOL_NAME = "catalog_search";

export interface CatalogSearchArgs {
  readonly query: string;
  readonly max_price_paise: number | null;
  readonly limit: number;
}

export interface CatalogListing {
  readonly sku: string;
  readonly label: string;
  readonly category: string;
  readonly merchant_id: string;
  readonly list_price_paise: number;
  readonly currency: string;
  readonly refundable: boolean;
  readonly in_stock: boolean;
  readonly description: UntrustedText;
  /** The merchant's own picture, or `null`. A claim, and never a match term. */
  readonly image_url: string | null;
}

function affordable(item: CatalogSku, args: CatalogSearchArgs): boolean {
  return (
    args.max_price_paise === null || item.listPricePaise <= args.max_price_paise
  );
}

/**
 * The catalog is matched on `sku`, `label` and `category` only — never on the
 * description. A search that read the prose would let injected text decide
 * which SKU the buyer is shown, which is the same attack one layer earlier.
 * This holds whatever the shelf is made of: a live Razorpay item's description
 * is merchant-authored text like any other, and it steers nothing.
 *
 * Matching is per term, not on the whole sentence. It used to be one
 * `includes` of the entire query, so "running shoes under 4000" matched
 * nothing — and an empty query matched *everything*, which is worse: a buyer
 * asking for shoes was shown the first four rows of the catalog and no part
 * of the system said the search had failed. Nothing matching now returns
 * nothing.
 *
 * DECISION: what comes back is the best-matching rows, not every row that
 * shares a single word with the query. "navy cotton kurta" returned a
 * cotton-silk stole alongside the kurta on the strength of "cotton", and the
 * model — reading two rows — told the shopper the shop had two navy kurtas.
 * The shelf read was right; the answer about it was not, and the answer was
 * built from this. Ties at the top all survive, so three merchants selling the
 * same garment still come back as three options.
 */
export class CatalogTool {
  constructor(
    private readonly source: MerchantCatalogSource,
    private readonly verifier: ToolEnvelopeVerifier,
    private readonly merchantId: string,
  ) {}

  async search(
    envelopeJws: string,
    call: ToolCall,
    args: CatalogSearchArgs,
  ): Promise<MerchantToolResult<readonly CatalogListing[]>> {
    const verified = await this.verifier.verify(envelopeJws, call);
    if (!verified.ok) {
      return { ok: false, failure: verified.failure };
    }
    return { ok: true, data: this.listings(await this.source.skus(), args) };
  }

  private listings(
    catalog: readonly CatalogSku[],
    args: CatalogSearchArgs,
  ): readonly CatalogListing[] {
    const scored = catalog
      .filter((item) => affordable(item, args))
      .map((item) => ({
        item,
        hits: hits(
          `${item.sku} ${item.label} ${item.category}`.toLowerCase(),
          args.query,
        ),
      }));
    const best = Math.max(0, ...scored.map((row) => row.hits));
    return (best === 0 ? [] : scored.filter((row) => row.hits === best))
      .sort((a, b) => a.item.listPricePaise - b.item.listPricePaise)
      .slice(0, Math.max(0, args.limit))
      .map((row) => this.listingOf(row.item));
  }

  private listingOf(item: CatalogSku): CatalogListing {
    return {
      sku: item.sku,
      label: item.label,
      category: item.category,
      merchant_id: this.merchantId,
      list_price_paise: item.listPricePaise,
      currency: item.currency,
      refundable: item.refundable,
      in_stock: item.stock > 0,
      description: untrusted(item.description),
      image_url: item.imageUrl,
    };
  }
}
