// One shelf, read once per turn, by everything in that turn. `chooseSku` read
// the frozen fixture while the quote tool read the live Razorpay shelf, so the
// agent named `ST-KURTA-NAVY-M` at a merchant whose only kurta is
// `item_TWNIHOyaam98x4` and the run died with no signed quote.
import { describe, expect, it } from "vitest";

import type { MerchantCatalogSource } from "../src/merchant/catalog-source.js";
import type { CatalogSku } from "../src/merchant/demo-catalog.js";
import { DEMO_CATALOG } from "../src/merchant/demo-catalog.js";
import { TurnShelf } from "../src/merchant/turn-shelf.js";

function row(sku: string): CatalogSku {
  return {
    sku,
    label: sku,
    category: "",
    listPricePaise: 100,
    currency: "INR",
    floorPricePaise: 100,
    refundable: false,
    stock: 1,
    description: "",
    imageUrl: null,
  };
}

class CountingSource implements MerchantCatalogSource {
  reads = 0;

  constructor(private rows: readonly CatalogSku[]) {}

  retire(next: readonly CatalogSku[]): void {
    this.rows = next;
  }

  skus(): Promise<readonly CatalogSku[]> {
    this.reads += 1;
    return Promise.resolve(this.rows);
  }
}

class BrokenSource implements MerchantCatalogSource {
  skus(): Promise<readonly CatalogSku[]> {
    return Promise.reject(new Error("RAZORPAY_UNAVAILABLE"));
  }
}

describe("one read per turn, not one per tool call", () => {
  it("answers every reader in the turn from the same read", async () => {
    const source = new CountingSource([row("item_a")]);
    const shelf = new TurnShelf(source);

    await shelf.open();
    await shelf.skus();
    await shelf.skus();

    expect(source.reads).toBe(1);
    expect(shelf.current()).toEqual([row("item_a")]);
  });

  it("shares one read between tools that ask at the same moment", async () => {
    const source = new CountingSource([row("item_a")]);
    const shelf = new TurnShelf(source);

    await Promise.all([shelf.skus(), shelf.skus(), shelf.skus()]);

    expect(source.reads).toBe(1);
  });

  it("does not carry a listing the merchant retired into the next turn", async () => {
    const source = new CountingSource([row("item_a")]);
    const shelf = new TurnShelf(source);
    await shelf.open();

    source.retire([row("item_b")]);
    await shelf.open();

    expect(source.reads).toBe(2);
    expect(shelf.current().map((item) => item.sku)).toEqual(["item_b"]);
  });
});

describe("a shelf read that fails is not a shelf", () => {
  it("throws rather than substituting anything", async () => {
    const shelf = new TurnShelf(new BrokenSource());

    await expect(shelf.open()).rejects.toThrow("RAZORPAY_UNAVAILABLE");
  });

  it("leaves nothing readable behind — no fixture, no stale turn", async () => {
    const shelf = new TurnShelf(new CountingSource([row("item_a")]));
    await shelf.open();

    const broken = new TurnShelf(new BrokenSource());
    await broken.open().catch(() => null);

    expect(broken.current()).toEqual([]);
    expect(broken.current()).not.toEqual(DEMO_CATALOG);
    expect(shelf.current()).toHaveLength(1);
  });

  it("re-reads on the next ask rather than caching the failure", async () => {
    const source = new CountingSource([row("item_a")]);
    const shelf = new TurnShelf(source);

    await shelf.open();
    await shelf.open();

    expect(source.reads).toBe(2);
  });
});
