// A buyer asked for "running shoes under ₹4,000" and was shown three kurtas
// and a pack of socks. The matcher tested the whole sentence as one substring,
// so nothing matched — and an empty needle matched everything, so the caller
// got the first four rows of the catalog with no sign the search had failed.
import { Money } from "@covenant/domain";
import { describe, expect, it } from "vitest";

import { FixtureCatalogSource } from "../src/merchant/catalog-source.js";
import { CatalogTool } from "../src/merchant/catalog-tool.js";
import type { CatalogSku } from "../src/merchant/demo-catalog.js";
import { DEMO_CATALOG } from "../src/merchant/demo-catalog.js";
import { skuOfItem } from "../src/merchant/item-sku.js";
import type { ToolCall } from "../src/shared/tool-envelope.js";

const CALL = { name: "catalog_search" } as ToolCall;

const ALWAYS_VERIFIED = {
  verify: async () => ({ ok: true as const, value: CALL }),
};

function search(query: string, maxPaise: number | null = null) {
  const tool = new CatalogTool(
    new FixtureCatalogSource(DEMO_CATALOG),
    ALWAYS_VERIFIED as never,
    "urn:covenant:merchant:kolam-run",
  );
  return tool.search("jws", CALL, {
    query,
    max_price_paise: maxPaise,
    limit: 10,
  });
}

async function skus(query: string, maxPaise: number | null = null) {
  const result = await search(query, maxPaise);
  if (!result.ok) throw new Error("search refused");
  return result.data.map((listing) => listing.sku);
}

describe("searching the catalog with a sentence, not a keyword", () => {
  it("finds shoes for “running shoes”, through both plural and gerund", async () => {
    const found = await skus("running shoes");
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((sku) => sku.includes("KURTA") === false)).toBe(true);
  });

  it("still finds them inside a whole sentence with a budget in it", async () => {
    const found = await skus(
      "running shoes under 4000 from a merchant you trust",
    );
    expect(found.length).toBeGreaterThan(0);
  });

  it("returns nothing rather than everything when nothing matches", async () => {
    expect(await skus("saxophone")).toEqual([]);
  });

  it("returns nothing for an empty query instead of the whole shelf", async () => {
    expect(await skus("")).toEqual([]);
  });

  it("does not offer a kurta to someone who asked for shoes", async () => {
    const found = await skus("running shoes");
    expect(found).not.toContain("ST-KURTA-NAVY-M");
  });

  it("finds the kurtas when the kurtas are what was asked for", async () => {
    expect(await skus("navy kurta")).toContain("ST-KURTA-NAVY-M");
  });

  it("keeps honouring the price ceiling", async () => {
    expect(await skus("kurta", 130_000)).not.toContain("NF-KURTA-NAVY-M");
  });
});

const HIDDEN = "https://shop.example/saxophone-trombone.jpg";

// A listing can now carry a merchant-supplied image URL, written onto a
// labelled line of the item description. It is a merchant claim like the prose
// around it, so it must not be able to decide which SKU a buyer is shown.
describe("a merchant's own image URL steers nothing", () => {
  const SHELF = [
    {
      sku: "SOCK-3P",
      label: "Cushioned crew socks, 3 pack",
      category: "hosiery",
      listPricePaise: 49_900,
      currency: "INR",
      floorPricePaise: 49_900,
      refundable: true,
      stock: 4,
      imageUrl: HIDDEN,
      description: `Merino-blend crew socks.\n\nProduct image: ${HIDDEN}`,
    },
  ];

  async function found(query: string) {
    const tool = new CatalogTool(
      new FixtureCatalogSource(SHELF),
      ALWAYS_VERIFIED as never,
      "urn:covenant:merchant:kolam-run",
    );
    const result = await tool.search("jws", CALL, {
      query,
      max_price_paise: null,
      limit: 10,
    });
    if (!result.ok) throw new Error("search refused");
    return result.data.map((listing) => listing.sku);
  }

  it("does not match a query on words a merchant hid in an image URL", async () => {
    expect(await found("saxophone")).toEqual([]);
    expect(await found("trombone")).toEqual([]);
  });

  it("still matches on what the shelf actually is", async () => {
    expect(await found("socks")).toEqual(["SOCK-3P"]);
  });
});

// The other half: it steers nothing, and it does reach the buyer. Without this
// the merchant could set an image and the shopper's card had no way to know.
const PICTURE = "https://kolam-run.example/kurta.jpg";

const ITEM = {
  itemId: "item_TWNIHOyaam98x4",
  name: "Navy cotton kurta, M",
  description: ["Handloom cotton.", "", `Product image: ${PICTURE}`].join("\n"),
  price: Money.fromPaise(129_900, "INR"),
  active: true,
};

function shelfOf(imageLine: string): readonly CatalogSku[] {
  const description = ["Handloom cotton.", "", imageLine].join("\n");
  return [skuOfItem({ ...ITEM, description })];
}

async function listed(shelf: readonly CatalogSku[]) {
  const tool = new CatalogTool(
    new FixtureCatalogSource(shelf),
    ALWAYS_VERIFIED as never,
    "urn:covenant:merchant:kolam-run",
  );
  const result = await tool.search("jws", CALL, {
    query: "navy kurta",
    max_price_paise: null,
    limit: 10,
  });
  if (!result.ok) throw new Error("search refused");
  return result.data[0];
}

describe("a merchant's image URL, read off the item description", () => {
  it("reads the labelled line", () => {
    expect(skuOfItem(ITEM).imageUrl).toBe(PICTURE);
  });

  it("takes https and nothing else", () => {
    const refused = [
      "Product image: http://kolam-run.example/kurta.jpg",
      "Product image: javascript:alert(1)",
      "Product image: data:image/png;base64,AAAA",
      "Product image: not-a-url",
      "Product image:",
      "the merchant wrote no image line at all",
    ];
    for (const line of refused) {
      expect(shelfOf(line)[0]?.imageUrl).toBeNull();
    }
  });

  it("leaves the marker line in the description, still quarantined at P0", () => {
    expect(skuOfItem(ITEM).description).toBe(ITEM.description);
  });
});

describe("a merchant's image URL reaching the listing", () => {
  it("carries it onto the listing the buyer is handed", async () => {
    const found = await listed(shelfOf(`Product image: ${PICTURE}`));
    expect(found?.image_url).toBe(PICTURE);
  });

  it("sends null rather than a guess when the merchant gave none", async () => {
    expect((await listed(shelfOf("no image here")))?.image_url).toBeNull();
  });
});
