import { DomainError } from "@covenant/domain";
import { describe, expect, it } from "vitest";

import { DEMO_CATALOG } from "../src/merchant/demo-catalog.js";
import { FakeClock } from "./fakes.js";
import { liveSource, POISONED_ITEM } from "./live-shelf.js";

describe("a live shelf read that fails", () => {
  /**
   * It used to answer with `DEMO_CATALOG`. Nothing downstream could tell that
   * apart from the merchant really stocking a poisoned trail shoe and three
   * kurtas, which is how the agent came to name fixture SKUs at a live shop.
   */
  it("throws rather than quietly serving the demo catalog", async () => {
    const { source } = liveSource(
      null,
      new FakeClock("2026-08-31T09:00:00.000Z"),
    );

    await expect(source.skus()).rejects.toBeInstanceOf(DomainError);
  });

  it("never answers with a fixture SKU on the failure path", async () => {
    const { source } = liveSource(
      null,
      new FakeClock("2026-08-31T09:00:00.000Z"),
    );

    const skus = await source.skus().catch(() => null);

    expect(skus).toBeNull();
    expect(DEMO_CATALOG.length).toBeGreaterThan(0);
  });

  it("serves the cache inside the TTL and re-reads once it lapses", async () => {
    const clock = new FakeClock("2026-08-31T09:00:00.000Z");
    const { reader, source } = liveSource([POISONED_ITEM], clock);

    await source.skus();
    await source.skus();
    expect(reader.reads).toBe(1);

    clock.advance(61_000);
    await source.skus();
    expect(reader.reads).toBe(2);
  });
});
