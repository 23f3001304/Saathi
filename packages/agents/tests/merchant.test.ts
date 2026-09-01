import { describe, expect, it } from "vitest";

import { POISONED_SKU } from "../src/merchant/demo-catalog.js";
import { CATALOG_ARGS, harness, SERVER } from "./merchant-harness.js";

describe("CatalogTool", () => {
  it("serves listings only behind a verified AM2 envelope", async () => {
    const { agent, buyerSigner } = harness();
    const envelope = await buyerSigner.sign({
      tool: "catalog_search",
      server: SERVER,
      args: { ...CATALOG_ARGS },
    });

    const result = await agent.search(envelope.jws, CATALOG_ARGS);

    expect(result.ok).toBe(true);
    expect(result.ok && result.data.length).toBeGreaterThan(0);
  });

  it("refuses an unsigned call", async () => {
    const { agent } = harness();

    const result = await agent.search("not.a.jws", CATALOG_ARGS);

    expect(!result.ok && result.failure).toBe("signature_invalid");
  });
});

describe("CatalogTool provenance tagging", () => {
  it("tags every description untrusted_text, poisoned or not", async () => {
    const { agent, buyerSigner } = harness();
    const envelope = await buyerSigner.sign({
      tool: "catalog_search",
      server: SERVER,
      args: { ...CATALOG_ARGS },
    });

    const result = await agent.search(envelope.jws, CATALOG_ARGS);
    const listings = result.ok ? result.data : [];

    expect(
      listings.every(
        (item) => item.description.provenance === "untrusted_text",
      ),
    ).toBe(true);
    const poisoned = listings.find((item) => item.sku === POISONED_SKU);
    expect(poisoned?.description.value).toContain("SYSTEM NOTE");
  });

  it("never matches on the description, so injected text cannot pick the SKU", async () => {
    const { agent, buyerSigner } = harness();
    const args = { query: "SYSTEM NOTE", max_price_paise: null, limit: 10 };
    const envelope = await buyerSigner.sign({
      tool: "catalog_search",
      server: SERVER,
      args: { ...args },
    });

    const result = await agent.search(envelope.jws, args);

    expect(result.ok && result.data).toEqual([]);
  });
});

describe("QuoteTool issues P2 merchant-signed quotes", () => {
  it("signs a quote with jti, expiry, reservation and per-line hashes", async () => {
    const { agent, buyerSigner } = harness();
    const args = { sku: "ASC-GC9-UK8", qty: 1, target_unit_paise: null };
    const envelope = await buyerSigner.sign({
      tool: "quote_request",
      server: SERVER,
      args: { ...args },
    });

    const result = await agent.quote(envelope.jws, args);
    if (!result.ok) {
      throw new Error(`expected a quote, got ${result.failure}`);
    }
    const { claims, ref, jws } = result.data;

    expect(claims.total_paise).toBe(199900);
    expect(claims.quote_jti).toMatch(/^urn:uuid:/);
    expect(claims.quote_expiry).toBe("2026-08-31T09:24:02.113Z");
    expect(claims.line_items[0]).toMatchObject({ sku: "ASC-GC9-UK8", qty: 1 });
    expect(claims.lines_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(ref.reservation_id).toMatch(/^resv_/);
    expect(jws.split(".")).toHaveLength(3);
  });
});

describe("QuoteTool negotiation floor", () => {
  it("concedes toward the buyer's target but never below the floor", async () => {
    const { quoteTool } = harness();

    const near = await quoteTool.quote({
      sku: "ASC-GC9-UK8",
      qty: 1,
      target_unit_paise: 185000,
    });
    const below = await quoteTool.quote({
      sku: "ASC-GC9-UK8",
      qty: 1,
      target_unit_paise: 10000,
    });

    expect(near?.claims.total_paise).toBe(185000);
    expect(below?.claims.total_paise).toBe(179900);
  });

  it("declines an unknown SKU and an order beyond stock", async () => {
    const { quoteTool } = harness();

    expect(
      await quoteTool.quote({ sku: "NOPE", qty: 1, target_unit_paise: null }),
    ).toBeNull();
    expect(
      await quoteTool.quote({
        sku: "KR-CITY-39",
        qty: 9,
        target_unit_paise: null,
      }),
    ).toBeNull();
  });
});
