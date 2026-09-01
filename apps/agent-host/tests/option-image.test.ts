// The merchant could set a picture and the shopper's card could render one,
// and nothing carried it between them — so the feature existed at both ends and
// nowhere in the middle. This is the middle.
import type { CatalogListing, CatalogSku } from "@covenant/agents";
import { describe, expect, it } from "vitest";

import { browseRows } from "../src/judge/browse-step.js";
import { optionRowsOf, presentListings } from "../src/purchase/presentation.js";

const PICTURE = "https://kolam-run.example/kurta.jpg";

function listing(over: Partial<CatalogListing> = {}): CatalogListing {
  return {
    sku: "ST-KURTA-NAVY-M",
    label: "Navy cotton kurta, M",
    category: "apparel",
    merchant_id: "kolam-run",
    list_price_paise: 129_900,
    currency: "INR",
    refundable: true,
    in_stock: true,
    description: { provenance: "untrusted_text", value: "Handloom cotton." },
    image_url: null,
    ...over,
  };
}

function shelfRow(imageUrl: string | null): CatalogSku {
  return {
    sku: "KR-SOCK-3P",
    label: "Kolam Run cushioned socks, 3 pack",
    category: "apparel",
    listPricePaise: 49_900,
    currency: "INR",
    floorPricePaise: 44_900,
    refundable: true,
    stock: 40,
    description: "Merino-blend crew socks.",
    imageUrl,
  };
}

function rowsFor(...listings: readonly CatalogListing[]) {
  return optionRowsOf(presentListings(listings));
}

describe("the merchant's picture on an option card", () => {
  it("reaches the row the shopper is shown", () => {
    expect(rowsFor(listing({ image_url: PICTURE }))[0]?.imageUrl).toBe(PICTURE);
  });

  it("is absent, not null, when the merchant gave none", () => {
    const row = rowsFor(listing())[0];
    expect(row?.imageUrl).toBeUndefined();
    expect(Object.hasOwn(row ?? {}, "imageUrl")).toBe(false);
  });

  it("reaches a browse row the same way", () => {
    expect(browseRows([shelfRow(PICTURE)], "kolam-run")[0]?.imageUrl).toBe(
      PICTURE,
    );
    expect(
      browseRows([shelfRow(null)], "kolam-run")[0]?.imageUrl,
    ).toBeUndefined();
  });
});

describe("what carrying a picture must not change", () => {
  it("orders nothing, and invents no rating or delivery estimate", () => {
    const rows = rowsFor(
      listing({ sku: "B", list_price_paise: 20_000, image_url: PICTURE }),
      listing({ sku: "A", list_price_paise: 10_000 }),
    );
    expect(rows.map((row) => row.sku)).toEqual(["A", "B"]);
    expect(rows[0]?.rating).toBe(0);
    expect(rows[0]?.deliveryDays).toBe(0);
  });

  it("puts the merchant's URL on `imageUrl` and nowhere else on the row", () => {
    const row = rowsFor(listing({ image_url: PICTURE }))[0];
    const elsewhere = Object.entries(row ?? {}).filter(
      ([key, value]) => key !== "imageUrl" && String(value).includes("example"),
    );
    expect(elsewhere).toEqual([]);
  });
});
