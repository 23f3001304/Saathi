import { describe, expect, it } from "vitest";

import type { CartLine, SkuPriceFloor } from "../src/index.js";
import {
  askUnitPaise,
  belowFloorLine,
  clearsFloor,
  floorFor,
} from "../src/index.js";

const STOLE: SkuPriceFloor = {
  merchant_id: "kolam-run",
  sku_id: "item_TWO4GVGhCE5lwW",
  floor_paise: 170000,
  list_paise: 189900,
  currency: "INR",
  declared_at: "2026-08-31T09:00:00.000Z",
  declared_by: "merchant-2026-08-479bb8bf",
};

function line(sku: string, unitPaise: number, qty = 1): CartLine {
  return { sku, category: "apparel", qty, unitPaise };
}

describe("a floor is the merchant's signature, not the agent's discretion", () => {
  it("admits the floor itself, and everything above it", () => {
    expect(clearsFloor(STOLE, 170000, "INR")).toBe(true);
    expect(clearsFloor(STOLE, 180000, "INR")).toBe(true);
    expect(clearsFloor(STOLE, 189900, "INR")).toBe(true);
  });

  it("refuses a single paise below it — a tolerance is a discount", () => {
    expect(clearsFloor(STOLE, 169999, "INR")).toBe(false);
  });

  it("refuses another currency outright rather than comparing the number", () => {
    expect(clearsFloor(STOLE, 180000, "USD")).toBe(false);
  });

  it("has nothing to say about a SKU no floor was declared for", () => {
    expect(floorFor([STOLE], "item_other")).toBeNull();
    expect(belowFloorLine([line("item_other", 1)], [STOLE], "INR")).toBeNull();
  });

  it("names the offending line, not merely that one exists", () => {
    const lines = [line("item_other", 100), line(STOLE.sku_id, 150000)];

    expect(belowFloorLine(lines, [STOLE], "INR")?.sku).toBe(STOLE.sku_id);
  });
});

describe("the single ask a buyer's agent may make", () => {
  const band = { listPaise: 189900, floorPaise: 170000, qty: 1 };

  it("asks for nothing when the listed price already clears the ceiling", () => {
    expect(askUnitPaise({ ...band, capPaise: 200000 })).toBeNull();
    expect(askUnitPaise({ ...band, capPaise: 189900 })).toBeNull();
  });

  it("asks for exactly what the ceiling needs, not for the whole band", () => {
    expect(askUnitPaise({ ...band, capPaise: 180000 })).toBe(180000);
  });

  it("asks for the floor only when the ceiling is that low", () => {
    expect(askUnitPaise({ ...band, capPaise: 170000 })).toBe(170000);
  });

  it("asks for nothing when even the floor cannot reach the ceiling", () => {
    expect(askUnitPaise({ ...band, capPaise: 169999 })).toBeNull();
  });

  it("asks for nothing when the merchant declared no discount authority", () => {
    const noBand = { listPaise: 189900, floorPaise: 189900, qty: 1 };

    expect(askUnitPaise({ ...noBand, capPaise: 180000 })).toBeNull();
  });

  it("divides the ceiling across the quantity, in integer paise, rounding down", () => {
    expect(
      askUnitPaise({
        listPaise: 189900,
        floorPaise: 100000,
        capPaise: 350001,
        qty: 2,
      }),
    ).toBe(175000);
  });
});
