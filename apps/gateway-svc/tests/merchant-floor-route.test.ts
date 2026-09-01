import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Harness } from "./support/flow.js";
import { boot, teardown } from "./support/flow.js";

let harness: Harness;

beforeAll(async () => {
  harness = await boot();
}, 60_000);

afterAll(async () => {
  await teardown(harness);
});

/**
 * The floor is the merchant's signature, so the route's whole job before it
 * stores anything is to establish that a merchant signed it. This boot has no
 * Razorpay key, which also pins the third answer: a band is declared *against*
 * a listed price, so a shelf the gateway cannot read is not a shelf it will
 * record authority over.
 */
describe("declaring a price floor", () => {
  const path = `/v1/merchant/items/item_TWO4GVGhCE5lwW/floor`;

  it("refuses an unsigned declaration", async () => {
    const response = await fetch(`${harness.running.url}${path}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ floor_paise: 170000 }),
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("refuses one signed with the buyer's key — a floor is the merchant's", async () => {
    const response = await harness.client.put(
      path,
      { floor_paise: 170000 },
      { role: "user" },
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("says unavailable rather than storing a band against a shelf it cannot read", async () => {
    const response = await harness.client.put(
      path,
      { floor_paise: 170000 },
      { role: "merchant" },
    );
    const body = (await response.json()) as { error: { reason_code: string } };

    expect(response.status).toBe(503);
    expect(body.error.reason_code).toBe("RAZORPAY_UNAVAILABLE");
  });
});
