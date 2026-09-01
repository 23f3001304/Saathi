import type { MerchantItem } from "@covenant/domain";
import { describe, expect, it } from "vitest";

import { CatalogTool } from "../src/merchant/catalog-tool.js";
import {
  AVAILABLE_UNCOUNTED,
  skuOfItem,
  UNCATEGORISED,
} from "../src/merchant/item-sku.js";
import { QuoteTool } from "../src/merchant/quote-tool.js";
import type { ToolCall } from "../src/shared/tool-envelope.js";
import { FakeClock, HmacMandateSigner, SeqIds } from "./fakes.js";
import { liveSource, POISONED_ITEM } from "./live-shelf.js";

const CALL = { name: "catalog_search" } as ToolCall;

const ALWAYS_VERIFIED = {
  verify: async () => ({ ok: true as const, value: CALL }),
};

async function skusFor(query: string, items: readonly MerchantItem[]) {
  const { source } = liveSource(
    items,
    new FakeClock("2026-08-31T09:00:00.000Z"),
  );
  const tool = new CatalogTool(source, ALWAYS_VERIFIED as never, "kolam-run");
  const result = await tool.search("jws", CALL, {
    query,
    max_price_paise: null,
    limit: 10,
  });
  if (!result.ok) throw new Error("search refused");
  return result.data.map((listing) => listing.sku);
}

describe("a live Razorpay item read as a shelf row", () => {
  it("keeps the amount as the list price and gives it no discount authority", () => {
    const sku = skuOfItem(POISONED_ITEM);

    expect(sku.sku).toBe("item_TWNIHOyaam98x4");
    expect(sku.listPricePaise).toBe(129900);
    expect(sku.floorPricePaise).toBe(129900);
  });

  it("claims neither a category nor refundability the item does not carry", () => {
    const sku = skuOfItem(POISONED_ITEM);

    // Not `""`: a cart line's category must be a non-empty string, so an empty
    // one is not "no category declared", it is an unreadable Cart Mandate.
    expect(sku.category).toBe(UNCATEGORISED);
    expect(sku.refundable).toBe(false);
  });

  it("reads `active` as availability, and an inactive item as out of stock", () => {
    expect(skuOfItem(POISONED_ITEM).stock).toBe(AVAILABLE_UNCOUNTED);
    expect(skuOfItem({ ...POISONED_ITEM, active: false }).stock).toBe(0);
  });
});

describe("a merchant-authored description cannot steer the search", () => {
  it("does not match a live item on words that appear only in its description", async () => {
    expect(await skusFor("saxophone", [POISONED_ITEM])).toEqual([]);
    expect(await skusFor("running shoes", [POISONED_ITEM])).toEqual([]);
  });

  it("still matches the same item on the label, which is the structured field", async () => {
    expect(await skusFor("navy kurta", [POISONED_ITEM])).toEqual([
      "item_TWNIHOyaam98x4",
    ]);
  });

  it("carries the description through tagged untrusted, unread but not hidden", async () => {
    const { source } = liveSource(
      [POISONED_ITEM],
      new FakeClock("2026-08-31T09:00:00.000Z"),
    );
    const tool = new CatalogTool(source, ALWAYS_VERIFIED as never, "kolam-run");

    const result = await tool.search("jws", CALL, {
      query: "kurta",
      max_price_paise: null,
      limit: 10,
    });

    expect(result.ok && result.data[0]?.description).toEqual({
      provenance: "untrusted_text",
      value: POISONED_ITEM.description,
    });
  });
});

describe("quoting a live item", () => {
  it("signs at the listed amount and refuses to be talked below it", async () => {
    const clock = new FakeClock("2026-08-31T09:00:00.000Z");
    const { source } = liveSource([POISONED_ITEM], clock);
    const tool = new QuoteTool(
      source,
      new HmacMandateSigner(),
      clock,
      new SeqIds(),
      {
        merchantIss: "urn:covenant:merchant:kolam-run",
        merchantId: "kolam-run",
        ttlSeconds: 600,
      },
    );

    const quote = await tool.quote({
      sku: "item_TWNIHOyaam98x4",
      qty: 1,
      target_unit_paise: 1,
    });

    expect(quote?.claims.total_paise).toBe(129900);
  });
});
