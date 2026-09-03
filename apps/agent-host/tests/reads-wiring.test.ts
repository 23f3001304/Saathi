// The reads are wired from the lane's own parts and read the covenant from
// the gateway this host is configured against, not from a copy.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { TurnPlanCollector } from "@covenant/agents";
import {
  DEMO_CATALOG,
  PROPOSE_TOOL,
  SEE_SHELF_TOOL,
} from "@covenant/agents";
import { afterAll, describe, expect, it } from "vitest";

import type { BrowserService } from "../src/browser/browser-service.js";
import { WebFindings } from "../src/browser/web-listing.js";
import { WebProgress } from "../src/browser/web-progress.js";
import { loadConfig } from "../src/config.js";
import { ConfirmationGate } from "../src/purchase/confirmation-gate.js";
import { inertContext } from "../src/purchase/context-record.js";
import { TurnLanguage } from "../src/purchase/turn-language.js";
import { WebOffered } from "../src/purchase/web-offered.js";
import { WebPickPark } from "../src/purchase/web-pick-park.js";
import { CredentialVault } from "../src/session/credential-vault.js";
import type { MerchantParts } from "../src/wiring/merchant-wiring.js";
import type { ReadDeps } from "../src/wiring/reads-wiring.js";
import { plannerReadsOf } from "../src/wiring/reads-wiring.js";
import type { SessionDeps } from "../src/wiring/session-wiring.js";
import { wireTurnPlanner } from "../src/wiring/session-wiring.js";
import { RecordingLogger, SeqIds, StepClock } from "./support/fakes.js";

const dir = mkdtempSync(join(tmpdir(), "covenant-reads-wiring-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const SNAPSHOT = {
  constraints: [{ predicate: "max_amount", content: { value: 250_000 } }],
  envelopes: [],
  merchants: ["urn:covenant:merchant:kolam-run"],
  skus: [],
};

function fetchRecording(calls: string[]): typeof fetch {
  return ((input: RequestInfo | URL) => {
    calls.push(String(input));
    return Promise.resolve(
      new Response(JSON.stringify(SNAPSHOT), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
}

function laneDeps(): ReadDeps {
  return {
    config: loadConfig({
      COVENANT_GATEWAY_URL: "http://gateway.test:8787",
      COVENANT_KEY_DIR: "./keys",
    }),
    merchant: {
      shelf: { open: () => Promise.resolve(DEMO_CATALOG), current: () => DEMO_CATALOG },
      merchantId: "kolam-run",
    } as unknown as MerchantParts,
    browser: { current: () => null } as unknown as BrowserService,
    offered: new WebOffered(),
    park: new WebPickPark(),
    progress: new WebProgress(),
    findings: new WebFindings(),
    gates: {
      intent: new ConfirmationGate(false),
      cart: new ConfirmationGate(false),
    },
    vault: new CredentialVault(join(dir, "vault.json")),
    context: inertContext(),
    language: new TurnLanguage(),
  };
}

/** Only what building the planner session touches. The router is constructed
 *  and never asked, so nothing here reaches a model. */
function plannerDeps(): SessionDeps {
  return {
    config: loadConfig({
      COVENANT_GATEWAY_URL: "http://gateway.test:8787",
      COVENANT_KEY_DIR: "./keys",
      COVENANT_AGENT_MODE: "live",
      OPENAI_API_KEY: "sk-test",
    }),
    obs: { logger: new RecordingLogger(), routing: { chose: () => undefined } },
    clock: new StepClock(),
    ids: new SeqIds(),
    // The planner's bounds read this shelf, so it has to be a real one.
    merchant: { agent: {}, shelf: { current: () => DEMO_CATALOG } },
    dispatch: { dispatcher: { dispatch: () => Promise.resolve(null) } },
    hook: { check: () => Promise.resolve(null) },
  } as unknown as SessionDeps;
}

describe("wiring the reads", () => {
  it("reads the shelf off the lane's merchant and the covenant off the configured gateway", async () => {
    const calls: string[] = [];
    const reads = plannerReadsOf(laneDeps(), fetchRecording(calls));

    expect((await reads.shelf()).merchant).toBe("kolam-run");
    const state = await reads.state();

    expect(calls[0]).toBe("http://gateway.test:8787/v1/covenant");
    expect(state.covenant.bounds).toEqual([
      { predicate: "max_amount", value: 250_000 },
    ]);
    expect(state.covenant.merchants).toEqual([
      "urn:covenant:merchant:kolam-run",
    ]);
    expect(state.sign_ins).toEqual([]);
    expect(state.checkout).toBeNull();
  });

  // A gateway that will not answer is not an empty covenant. The read throws
  // and the collector answers `read_failed`, so the model is told it could not
  // look rather than shown a world with no rules in it.
  it("lets a refused covenant read throw rather than reporting no rules", async () => {
    const refusing = (() =>
      Promise.resolve(new Response("nope", { status: 503 }))) as typeof fetch;
    const reads = plannerReadsOf(laneDeps(), refusing);

    await expect(reads.state()).rejects.toThrow("/v1/covenant");
  });
});

describe("wiring the planner's eyes", () => {
  // A planner given no reads refuses with `no_reads`, so a shelf that comes
  // back named is proof this lane's eyes reached the model's side. What the
  // planner declares is `planner-reads.test.ts`'s to check.
  it("answers a shelf read from this lane's own catalog", async () => {
    const reads = plannerReadsOf(laneDeps(), fetchRecording([]));
    const { planner } = wireTurnPlanner(plannerDeps(), reads);
    const { collector } = planner as unknown as {
      collector: TurnPlanCollector;
    };

    const seen = await collector.dispatch({
      tool: SEE_SHELF_TOOL,
      server: "buyer",
      args: {},
    });
    expect(seen.isError).toBe(false);
    expect(JSON.parse(seen.content)).toMatchObject({ merchant: "kolam-run" });
  });
});

// The bounds ride the same seam as the eyes, and only they make the cap and
// the shelf mean anything on the live path: without them the ceiling a
// proposal carries is whatever the model typed.
describe("wiring the planner's bounds", () => {
  it("checks a proposal against this host's cap, not against nothing", async () => {
    const deps = plannerDeps();
    const { planner } = wireTurnPlanner(deps, null);
    const { collector } = planner as unknown as {
      collector: TurnPlanCollector;
    };

    const outcome = await collector.dispatch({
      tool: PROPOSE_TOOL,
      server: "buyer",
      args: {
        reply: "Drafting that now.",
        sku: "ST-KURTA-NAVY-M",
        max_amount_paise: deps.config.capPaise + 1,
        requires_refundability: false,
        description: "a navy kurta",
      },
    });

    expect(outcome.isError).toBe(true);
    expect(JSON.parse(outcome.content)).toMatchObject({
      failure: "cap_exceeded",
      cap_paise: deps.config.capPaise,
    });
    expect(collector.take()).toBeNull();
  });
});
