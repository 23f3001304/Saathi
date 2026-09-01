import { describe, expect, it } from "vitest";

import { boot, teardown } from "./support/flow.js";

/**
 * ARCHITECTURE §10.4's drain, asserted rather than assumed: stop accepting,
 * let in-flight verdicts finish, then close the database. The socket has to be
 * gone afterwards — a port that still answers after `shutdown` resolved would
 * mean a verdict could start with no database under it.
 */
describe("graceful shutdown", () => {
  it("stops accepting, settles the drain and closes the handles", async () => {
    const harness = await boot();
    const before = await harness.client.get("/healthz");
    expect(before.status).toBe(200);

    await harness.running.shutdown("SIGTERM");

    expect(harness.running.root.drain.isDraining).toBe(true);
    expect(harness.running.root.drain.pending).toBe(0);
    expect(harness.running.root.stores.db.open).toBe(false);
    await expect(harness.client.get("/healthz")).rejects.toThrow();
    await teardown(harness);
  });

  it("refuses a new verdict once the drain has begun", async () => {
    const harness = await boot();
    harness.running.root.drain.begin();
    const response = await harness.client.post("/v1/verify-cart", {
      cart_mandate_jwt: "a.b.c",
      intent_mandate_jwt: "a.b.c",
      memory_entry_ids: ["mem_1"],
      tenant_id: "tnt_demo",
    });
    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      error: { reason_code: string; type: string };
    };
    expect(body.error.reason_code).toBe("GATEWAY_DRAINING");
    expect(body.error.type).toBe("service_unavailable");
    await teardown(harness);
  });
});
