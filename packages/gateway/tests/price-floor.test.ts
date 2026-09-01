import { beforeEach, describe, expect, it } from "vitest";

import { PriceFloorService, resolveSignedQuote } from "../src/index.js";
import type { FloorCommand } from "../src/index.js";
import type { Harness } from "./harness.js";
import { newHarness } from "./harness.js";
import { TENANT } from "./fixtures.js";

const SKU = "item_TWO4GVGhCE5lwW";

let harness: Harness;
let floors: PriceFloorService;

function command(overrides: Partial<FloorCommand> = {}): FloorCommand {
  return {
    tenantId: TENANT,
    merchantId: "kolam-run",
    skuId: SKU,
    floorPaise: 170000,
    listPaise: 189900,
    currency: "INR",
    declaredBy: "merchant-2026-08-479bb8bf",
    requestId: "req-floor",
    ...overrides,
  };
}

function kinds(): string[] {
  return harness.reader
    .readAfter(0, 100)
    .map((event) => event.kind)
    .filter((kind) => kind.startsWith("merchant.floor"));
}

beforeEach(async () => {
  harness = await newHarness();
  floors = new PriceFloorService(
    harness.floors,
    harness.events,
    harness.ledger,
    harness.clock,
  );
});

describe("declaring a floor", () => {
  it("stores the band the merchant signed, list price and all", () => {
    floors.apply(command());

    expect(harness.floors.find(TENANT, SKU)).toEqual({
      merchant_id: "kolam-run",
      sku_id: SKU,
      floor_paise: 170000,
      list_paise: 189900,
      currency: "INR",
      declared_at: harness.clock.now().toISOString(),
      declared_by: "merchant-2026-08-479bb8bf",
    });
  });

  it("has no side effect without its ledger event", () => {
    floors.apply(command());

    expect(kinds()).toEqual(["merchant.floor.set"]);
  });

  it("refuses a floor above the merchant's own listed price", () => {
    const outcome = floors.apply(command({ floorPaise: 200000 }));

    expect(outcome).toEqual({
      status: "rejected",
      reasonCode: "SCHEMA_VIOLATION",
    });
    expect(harness.floors.find(TENANT, SKU)).toBeNull();
    expect(kinds()).toEqual([]);
  });

  it("replaces the standing band rather than accumulating rows", () => {
    floors.apply(command());
    floors.apply(command({ floorPaise: 175000 }));

    expect(harness.floors.find(TENANT, SKU)?.floor_paise).toBe(175000);
    expect(harness.floors.forMerchant(TENANT, "kolam-run")).toHaveLength(1);
  });
});

describe("clearing a floor", () => {
  it("leaves no authority behind, and says so in the ledger", () => {
    floors.apply(command());

    expect(floors.apply(command({ floorPaise: null }))).toEqual({
      status: "cleared",
    });
    expect(harness.floors.find(TENANT, SKU)).toBeNull();
    expect(kinds()).toEqual(["merchant.floor.set", "merchant.floor.cleared"]);
  });

  it("is a ledgered act even when there was nothing to clear", () => {
    floors.apply(command({ floorPaise: null }));

    expect(kinds()).toEqual(["merchant.floor.cleared"]);
  });
});

describe("the negotiation the gateway records", () => {
  it("lifts the buyer's ask out of the merchant's own attestation", () => {
    const entry = {
      id: "mem_1",
      tenantId: TENANT,
      tier: 2 as const,
      sourceRef: "urn:uuid:q1",
      subject: SKU,
      content: {
        quote_jti: "urn:uuid:q1",
        sku_id: SKU,
        total_paise: 180000,
        asked_unit_paise: 180000,
        quote_expiry: "2026-08-31T10:15:00.000Z",
        reservation_id: "rsv_1",
      },
    } as unknown as Parameters<typeof resolveSignedQuote>[0][number];

    expect(resolveSignedQuote([entry], "urn:uuid:q1")).toMatchObject({
      sku_id: SKU,
      total_paise: 180000,
      asked_unit_paise: 180000,
    });
  });
});

describe("an absent ask is recorded as absent", () => {
  it("says the ask was absent rather than inventing one", () => {
    const entry = {
      id: "mem_2",
      tenantId: TENANT,
      tier: 2 as const,
      sourceRef: "urn:uuid:q2",
      subject: SKU,
      content: {
        quote_jti: "urn:uuid:q2",
        total_paise: 189900,
        quote_expiry: "2026-08-31T10:15:00.000Z",
        reservation_id: "rsv_2",
      },
    } as unknown as Parameters<typeof resolveSignedQuote>[0][number];

    expect(resolveSignedQuote([entry], "urn:uuid:q2")).toMatchObject({
      sku_id: SKU,
      asked_unit_paise: null,
    });
  });
});

describe("reading floors for a cart", () => {
  it("answers only for the SKUs asked about", () => {
    floors.apply(command());
    floors.apply(
      command({ skuId: "other", floorPaise: 1000, listPaise: 2000 }),
    );

    const found = harness.floors.forSkus(TENANT, [SKU, "unknown"]);

    expect(found.map((floor) => floor.sku_id)).toEqual([SKU]);
  });

  it("is scoped to the tenant that declared it", () => {
    floors.apply(command());

    expect(harness.floors.find("tnt_other", SKU)).toBeNull();
  });
});
