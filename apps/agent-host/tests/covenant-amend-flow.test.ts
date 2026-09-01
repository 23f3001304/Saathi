import type { GatewayClient } from "@covenant/agents";
import type { IntentMandateIssuer } from "@covenant/mandates";
import { describe, expect, it } from "vitest";

import { AmendFlow } from "../src/covenant/amend-flow.js";

const NOW = new Date("2026-08-31T12:00:00.000Z");

/** The covenant in force: a purchase intent that expires tomorrow. */
const HELD = {
  constraints: [
    { predicate: "max_amount", content: { value: 200_000 } },
    {
      predicate: "intent_expiry",
      content: { value: "2026-09-01T13:45:58.474Z" },
    },
  ],
  envelopes: [],
  merchants: [],
  skus: [],
};

function issuerOver(seen: { bounds: unknown[] }): IntentMandateIssuer {
  return {
    issue: (request: { bounds: unknown }) => {
      seen.bounds.push(request.bounds);
      return Promise.resolve({ jwt: "jwt.for.test" });
    },
  } as unknown as IntentMandateIssuer;
}

const GATEWAY = {
  signCovenant: () =>
    Promise.resolve({
      ok: true,
      value: { mandate_id: "urn:uuid:test", committed_constraints: ["mem_1"] },
    }),
} as unknown as GatewayClient;

const SILENT = {
  info: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
};

const READ_BACK = (() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve(HELD),
  })) as unknown as typeof fetch;

const CONFIG = {
  gatewayUrl: "http://gateway.test",
  apiVersion: "2026-08-31",
  tenantId: "tnt_test",
  userIss: "urn:covenant:user:test",
  agentInstanceId: "agent-1",
  currency: "INR",
};

function flowOver(seen: { bounds: unknown[] }): AmendFlow {
  const clock = { now: () => NOW };
  return new AmendFlow(
    issuerOver(seen),
    GATEWAY,
    clock,
    SILENT as never,
    CONFIG,
    READ_BACK,
  );
}

function noEdits() {
  return { envelopes: [], merchants: [], skus: [] };
}

describe("a standing covenant is not a purchase", () => {
  it("does not inherit the expiry of whatever was signed last", async () => {
    const seen = { bounds: [] as unknown[] };
    await flowOver(seen).seal(
      { bounds: [{ predicate: "max_amount", value: 120_000 }], ...noEdits() },
      "tighter",
    );
    const bounds = seen.bounds[0] as {
      intent_expiry: string;
      allowance: { max_amount: number; expires_at: string };
    };
    // The covenant in force expires tomorrow because a purchase drafted it.
    // Carrying that into a rule the shopper sealed would expire their rules
    // overnight — they would seal them, see them, and find them gone.
    expect(bounds.intent_expiry).toBe("2026-09-30T12:00:00.000Z");
    expect(bounds.allowance.expires_at).toBe("2026-09-30T12:00:00.000Z");
    expect(bounds.allowance.max_amount).toBe(120_000);
  });
});

describe("a seal reports what the ledger says", () => {
  it("reports an edit the ledger did not take", async () => {
    const seen = { bounds: [] as unknown[] };
    const result = await flowOver(seen).seal(
      // The read-back still says 200000, so this one plainly did not land.
      { bounds: [{ predicate: "max_amount", value: 999_999 }], ...noEdits() },
      "wishful",
    );
    expect(result.refused).toEqual(["max_amount"]);
  });
});
