import { describe, expect, it } from "vitest";

import { harness, SERVER } from "./merchant-harness.js";

describe("MerchantAgent", () => {
  it("refuses a quote whose envelope was signed over other arguments", async () => {
    const { agent, buyerSigner } = harness();
    const envelope = await buyerSigner.sign({
      tool: "quote_request",
      server: SERVER,
      args: { sku: "ASC-GC9-UK8", qty: 1, target_unit_paise: 199900 },
    });

    const result = await agent.quote(envelope.jws, {
      sku: "ASC-GC9-UK8",
      qty: 1,
      target_unit_paise: 100,
    });

    expect(!result.ok && result.failure).toBe("args_tampered");
  });

  it("stops re-quoting the same SKU forever", async () => {
    const { agent, buyerSigner } = harness(1);
    const args = { sku: "ASC-GC9-UK8", qty: 1, target_unit_paise: null };
    const sign = () =>
      buyerSigner.sign({
        tool: "quote_request",
        server: SERVER,
        args: { ...args },
      });

    expect((await agent.quote((await sign()).jws, args)).ok).toBe(true);
    expect((await agent.quote((await sign()).jws, args)).ok).toBe(false);
  });
});
