import { DomainError, Money } from "@covenant/domain";
import { describe, expect, it } from "vitest";

import { RazorpayClient } from "../src/razorpay-client.js";
import { RazorpayErrorMapper } from "../src/razorpay-error-mapper.js";
import { RazorpayItemCatalog } from "../src/razorpay-item-catalog.js";
import { RetryPolicy } from "../src/retry-policy.js";
import {
  FakeClock,
  RecordingLogger,
  RecordingTracer,
  fakeFetchSequence,
  instantSleep,
  jsonResponse,
  testConfig,
} from "./fixtures.js";

/** The exact body a live `GET /v1/items` returned for the probe item. */
const LIVE_ITEM = {
  id: "item_TWNIHOyaam98x4",
  active: true,
  name: "Navy cotton kurta, M",
  description: "Handloom cotton, refundable within 30 days",
  amount: 129900,
  unit_amount: 129900,
  currency: "INR",
  type: "invoice",
  unit: null,
  tax_inclusive: false,
  hsn_code: null,
  sac_code: null,
  tax_rate: null,
  tax_id: null,
  tax_group_id: null,
  created_at: 1788178828,
};

function build(responses: readonly Response[]) {
  const { fetch: fetchImpl, calls } = fakeFetchSequence(responses);
  const clock = new FakeClock(0, 10);
  const client = new RazorpayClient(
    testConfig,
    fetchImpl,
    new RetryPolicy(clock, instantSleep),
    clock,
    new RecordingLogger(),
    new RecordingTracer(),
    new RazorpayErrorMapper(),
  );
  return { catalog: new RazorpayItemCatalog(client), calls };
}

describe("RazorpayItemCatalog against the live response shape", () => {
  it("reads a listing into MerchantItem, paise and currency intact", async () => {
    const { catalog } = build([
      jsonResponse(200, { entity: "collection", count: 1, items: [LIVE_ITEM] }),
    ]);

    const items = await catalog.listItems(10);

    expect(items).toHaveLength(1);
    expect(items[0]?.itemId).toBe("item_TWNIHOyaam98x4");
    expect(items[0]?.price.paise).toBe(129900);
    expect(items[0]?.price.currency).toBe("INR");
    expect(items[0]?.active).toBe(true);
  });

  it("caps count at the 100 the API accepts", async () => {
    const { catalog, calls } = build([
      jsonResponse(200, { entity: "collection", count: 0, items: [] }),
    ]);

    await catalog.listItems(5000);

    expect(calls[0]?.url).toContain("/items?count=100");
  });
});

describe("RazorpayItemCatalog writes", () => {
  it("creates with amount in paise and reads the created item back", async () => {
    const { catalog, calls } = build([jsonResponse(200, LIVE_ITEM)]);

    const created = await catalog.createItem({
      name: "Navy cotton kurta, M",
      description: "Handloom cotton, refundable within 30 days",
      price: Money.fromPaise(129900, "INR"),
    });

    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      name: "Navy cotton kurta, M",
      description: "Handloom cotton, refundable within 30 days",
      amount: 129900,
      currency: "INR",
    });
    expect(created.itemId).toBe("item_TWNIHOyaam98x4");
  });

  it("PATCHes only the fields the caller set, so an unsent field is not blanked", async () => {
    const { catalog, calls } = build([jsonResponse(200, LIVE_ITEM)]);

    await catalog.updateItem("item_TWNIHOyaam98x4", {
      name: null,
      description: null,
      price: Money.fromPaise(139900, "INR"),
      active: false,
    });

    expect(calls[0]?.init?.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      amount: 139900,
      currency: "INR",
      active: false,
    });
  });
});

describe("RazorpayItemCatalog fail-closed parsing", () => {
  it("refuses a body that is not the item shape rather than guessing at it", async () => {
    const { catalog } = build([jsonResponse(200, { entity: "collection" })]);

    await expect(catalog.listItems(10)).rejects.toBeInstanceOf(DomainError);
  });
});
