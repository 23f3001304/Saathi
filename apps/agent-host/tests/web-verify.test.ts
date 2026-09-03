// What a verify hands over is what the page printed and nothing it inferred
// about it. The row says a product is "declared" only where the page
// published one in the web's own vocabulary; a tile the reader worked out
// from where a picture sits is the reader's reading, not the page's claim,
// and letting an upsell tile call itself the declared product would put a
// warranty's name on a card as the shop's own.
import type { BatchRead, PageListing } from "@covenant/browser-drive";
import { EMPTY_PAGE } from "@covenant/browser-drive";
import { beforeEach, describe, expect, it } from "vitest";

import { WebFindings } from "../src/browser/web-listing.js";
import { WebTrail } from "../src/browser/web-trail.js";
import { VerifiedReads, VerifyVerbs } from "../src/browser/web-verify.js";

const P1 = "https://shop.example/p1";
const PRICE = "₹1,299.00";
const SHOT = "https://shop.example/img/navy-kurta.jpg";
const TILE_SHOT = "https://shop.example/img/dupatta.jpg";
const AROUND = { text: PRICE, around: `Navy Kurta ${PRICE}` };

const PRODUCT: PageListing = {
  title: "Navy Kurta",
  priceText: PRICE,
  href: P1,
  imageUrl: SHOT,
};

const TILE: PageListing = {
  title: "Matching Dupatta",
  priceText: "₹499.00",
  href: `${P1}#dupatta`,
  imageUrl: TILE_SHOT,
};

function batchOf(over: Partial<BatchRead> = {}): BatchRead {
  return {
    requested: P1,
    url: P1,
    dom: {
      ...EMPTY_PAGE,
      url: P1,
      title: "Navy Kurta",
      heading: "Navy Kurta",
      listings: [PRODUCT, TILE],
    },
    declared: [PRODUCT],
    prices: [AROUND],
    text: `Navy Kurta ${PRICE} Add to cart`,
    soldOut: false,
    failure: null,
    ...over,
  };
}

let reads: VerifiedReads;
let findings: WebFindings;

function verifying(batch: BatchRead): VerifyVerbs {
  return new VerifyVerbs(
    { readMany: () => Promise.resolve([batch]) },
    reads,
    new WebTrail(),
  );
}

async function pageFrom(batch: BatchRead): Promise<Record<string, unknown>> {
  const result = await verifying(batch).verify([P1]);
  const pages = result.body["pages"] as Record<string, unknown>[];
  return pages[0] ?? {};
}

beforeEach(() => {
  reads = new VerifiedReads();
  findings = new WebFindings();
});

describe("a verify reads and records nothing", () => {
  it("hands back what the page printed and mints no ref at all", async () => {
    const page = await pageFrom(batchOf());
    expect(findings.length).toBe(0);
    expect(page["ref"]).toBeUndefined();
    expect(page["prices"]).toEqual([AROUND]);
    expect(page["heading"]).toBe("Navy Kurta");
    expect(page["text"]).toContain("Add to cart");
  });

  it("remembers the batch, so web_card has a page to check against", async () => {
    await verifying(batchOf()).verify([P1]);
    expect(reads.find(P1)?.title).toBe("Navy Kurta");
  });
});

describe("what the page declared, and what it merely showed", () => {
  it("names the product the page published in the web's own vocabulary", async () => {
    expect((await pageFrom(batchOf()))["declared"]).toEqual({
      name: "Navy Kurta",
      price_text: PRICE,
      image_url: SHOT,
    });
  });

  it("declares nothing where the reader only inferred tiles", async () => {
    expect((await pageFrom(batchOf({ declared: [] })))["declared"]).toBeNull();
  });

  it("carries every picture the page put on a product, declared or tiled", async () => {
    expect((await pageFrom(batchOf({ declared: [] })))["images"]).toEqual([
      SHOT,
      TILE_SHOT,
    ]);
  });
});
