import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TENANT } from "./support/fixtures.js";
import type { Chain, Harness, SeededMemory } from "./support/flow.js";
import { boot, issueChain, seedMemory, teardown } from "./support/flow.js";
import { SseCollector } from "./support/sse-collector.js";

let harness: Harness;
let seeded: SeededMemory;
let chain: Chain;
let stream: SseCollector;
let verifyBody: {
  decision: string;
  txn_id: string;
  verdicts: { check: string; outcome: string }[];
  payment_mandate_jwt: string | null;
  reason_code: string | null;
};

function verifyRequest(): Readonly<Record<string, unknown>> {
  return {
    cart_mandate_jwt: chain.cart.jwt,
    intent_mandate_jwt: chain.intent.jwt,
    memory_entry_ids: [...seeded.entryIds],
    tenant_id: TENANT,
  };
}

beforeAll(async () => {
  harness = await boot();
  stream = new SseCollector();
  await stream.connect(`${harness.running.url}/v1/ledger/stream`);
  seeded = await seedMemory(harness);
  chain = await issueChain(harness, seeded);
  const response = await harness.client.post("/v1/verify-cart", verifyRequest());
  expect(response.status).toBe(200);
  verifyBody = await response.json();
}, 60_000);

afterAll(async () => {
  await stream.close();
  await teardown(harness);
});

describe("boot", () => {
  it("answers /healthz and /readyz", async () => {
    const [health, ready] = await Promise.all([
      harness.client.get("/healthz"),
      harness.client.get("/readyz"),
    ]);
    expect(health.status).toBe(200);
    expect(ready.status).toBe(200);
    const body = (await ready.json()) as {
      ok: boolean;
      checks: { ledger_open: boolean; jwks_loaded: number };
    };
    expect(body.ok).toBe(true);
    expect(body.checks.ledger_open).toBe(true);
    expect(body.checks.jwks_loaded).toBe(3);
  });
});

describe("verify-cart over HTTP", () => {
  it("approves the golden cart with all eight seals", () => {
    expect(verifyBody.decision).toBe("approve");
    expect(verifyBody.verdicts).toHaveLength(8);
    expect(
      verifyBody.verdicts.every((verdict) => verdict.outcome === "pass"),
    ).toBe(true);
    expect(verifyBody.payment_mandate_jwt).not.toBeNull();
  });
});

describe("execute-payment over HTTP", () => {
  it("reaches a terminal fake-rail state with an order and a link", async () => {
    const response = await harness.client.post("/v1/execute-payment", {
      payment_mandate_jwt: verifyBody.payment_mandate_jwt,
      tenant_id: TENANT,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      txn_id: string;
      rzp_order_id: string;
      payment_link: string;
      state: string;
    };
    expect(body.ok).toBe(true);
    expect(body.txn_id).toBe(verifyBody.txn_id);
    expect(body.rzp_order_id).toMatch(/^order_fake_/);
    expect(body.payment_link).toMatch(/^https:\/\/rzp\.local\/fake\//);
    expect(body.state).toBe("link_issued");
  });
});

describe("T-31 — the same cart mandate under a fresh idempotency key", () => {
  it("is a 200 verdict body with NONCE_BURNED on the nonce seal", async () => {
    const response = await harness.client.post(
      "/v1/verify-cart",
      verifyRequest(),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as typeof verifyBody;
    expect(body.decision).toBe("reject");
    expect(body.reason_code).toBe("NONCE_BURNED");
    expect(body.verdicts).toHaveLength(8);
    expect(
      body.verdicts.find((verdict) => verdict.check === "nonce")?.outcome,
    ).toBe("fail");
    expect(body.payment_mandate_jwt).toBeNull();
  });
});

describe("the ledger stream", () => {
  it("delivers frames in strictly ascending seq order", async () => {
    await stream.waitFor(6);
    const ids = stream.frames.map((frame) => frame.id);
    expect(ids.length).toBeGreaterThan(5);
    expect([...ids].sort((left, right) => left - right)).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
    expect(stream.frames.map((frame) => frame.kind)).toContain(
      "verdict.emitted",
    );
  });

  it("resumes from Last-Event-ID and replays only later frames", async () => {
    const resumed = new SseCollector();
    const cursor = stream.frames[1]?.id ?? 1;
    await resumed.connect(`${harness.running.url}/v1/ledger/stream`, cursor);
    await resumed.waitFor(1);
    expect(resumed.frames.length).toBeGreaterThan(0);
    expect(resumed.frames.every((frame) => frame.id > cursor)).toBe(true);
    const ids = resumed.frames.map((frame) => frame.id);
    expect([...ids].sort((left, right) => left - right)).toEqual(ids);
    await resumed.close();
  });
});

describe("the read surface", () => {
  it("serves the audit chain, the transactions list and the head", async () => {
    const [audit, txns, head, recs] = await Promise.all([
      harness.client.get(`/v1/audit/${verifyBody.txn_id}`),
      harness.client.get("/v1/transactions?limit=10"),
      harness.client.get("/v1/ledger/head"),
      harness.client.get("/v1/recs?limit=3"),
    ]);
    expect(audit.status).toBe(200);
    expect(((await audit.json()) as { chain_ok: boolean }).chain_ok).toBe(true);
    const list = (await txns.json()) as { items: { txn_id: string }[] };
    expect(list.items.map((item) => item.txn_id)).toContain(verifyBody.txn_id);
    expect(((await head.json()) as { height: number }).height).toBeGreaterThan(0);
    expect(recs.status).toBe(200);
  });

  it("rejects a read that omits the pinned API-Version", async () => {
    const response = await fetch(`${harness.running.url}/v1/transactions`, {
      headers: { "Request-Id": "00000000-0000-4000-8000-000000000001" },
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { reason_code: string };
    };
    expect(body.error.reason_code).toBe("API_VERSION_UNSUPPORTED");
  });
});
