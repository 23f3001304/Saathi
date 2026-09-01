import type { MerchantItem, ShelfItem, ShelfReader } from "@covenant/domain";
import { Money } from "@covenant/domain";
import { describe, expect, it } from "vitest";

import { LiveCatalogSource } from "../src/merchant/catalog-source.js";
import { skuOfItem } from "../src/merchant/item-sku.js";
import { QuoteTool } from "../src/merchant/quote-tool.js";
import {
  FakeClock,
  HmacMandateSigner,
  RecordingLogger,
  SeqIds,
} from "./fakes.js";

const STOLE: MerchantItem = {
  itemId: "item_TWO4GVGhCE5lwW",
  name: "Nilgiri handloom stole, cotton-silk",
  description: "Handwoven in the Nilgiris.",
  price: Money.fromPaise(189900, "INR"),
  active: true,
};

class Shelf implements ShelfReader {
  constructor(private readonly floorPaise: number | null) {}

  listShelf(): Promise<readonly ShelfItem[]> {
    return Promise.resolve([{ item: STOLE, floorPaise: this.floorPaise }]);
  }
}

function quoteToolFor(floorPaise: number | null): QuoteTool {
  const clock = new FakeClock("2026-08-31T09:00:00.000Z");
  const source = new LiveCatalogSource(
    new Shelf(floorPaise),
    clock,
    new RecordingLogger(),
    { limit: 50, ttlSeconds: 0 },
  );
  return new QuoteTool(source, new HmacMandateSigner(), clock, new SeqIds(), {
    merchantIss: "urn:covenant:merchant:kolam-run",
    merchantId: "kolam-run",
    ttlSeconds: 600,
  });
}

function ask(floorPaise: number | null, targetPaise: number | null) {
  return quoteToolFor(floorPaise).quote({
    sku: STOLE.itemId,
    qty: 1,
    target_unit_paise: targetPaise,
  });
}

describe("a shelf row carries the band its merchant signed", () => {
  it("reads the declared floor onto the SKU", () => {
    expect(skuOfItem(STOLE, 170000).floorPricePaise).toBe(170000);
  });

  it("reports the listed price as the floor when none was declared", () => {
    expect(skuOfItem(STOLE, null).floorPricePaise).toBe(189900);
  });

  it("never invents a discount from a listing that declared none", async () => {
    const quote = await ask(null, 150000);

    expect(quote?.claims.total_paise).toBe(189900);
  });
});

describe("nothing signs below the floor — not even for a buyer who asks", () => {
  it("signs the asked price when it sits inside the band", async () => {
    const quote = await ask(170000, 180000);

    expect(quote?.claims.total_paise).toBe(180000);
  });

  it("signs the floor, never below it, however low the ask", async () => {
    const quote = await ask(170000, 1);

    expect(quote?.claims.total_paise).toBe(170000);
  });

  it("never signs above the listed price either", async () => {
    const quote = await ask(170000, 999900);

    expect(quote?.claims.total_paise).toBe(189900);
  });

  it("signs at list when the buyer asks for nothing", async () => {
    const quote = await ask(170000, null);

    expect(quote?.claims.total_paise).toBe(189900);
  });
});

describe("the signed quote is the record of the negotiation", () => {
  it("carries what was asked, the band, and what was settled", async () => {
    const quote = await ask(170000, 150000);

    expect(quote?.claims).toMatchObject({
      asked_unit_paise: 150000,
      floor_unit_paise: 170000,
      list_unit_paise: 189900,
      total_paise: 170000,
    });
  });

  it("says the ask was absent rather than pretending it was the list price", async () => {
    const quote = await ask(170000, null);

    expect(quote?.claims.asked_unit_paise).toBeNull();
  });
});
