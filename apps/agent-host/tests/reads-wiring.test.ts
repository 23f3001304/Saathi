// The reads are wired from the lane's own parts and read the covenant from
// the gateway this host is configured against, not from a copy.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { TurnPlanCollector } from "@covenant/agents";
import {
  DEMO_CATALOG,
  SEE_SHELF_TOOL,
  SEE_STATE_TOOL,
  TURN_PLAN_TOOLS,
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
    merchant: { agent: {} },
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
  // The declared reads and the collector that answers them are wired at the
  // same seam. A planner given no reads refuses with `no_reads`, so a shelf
  // that comes back named is proof this lane's eyes reached the model's side.
  it("declares both reads on the planner and answers them from the lane", async () => {
    const reads = plannerReadsOf(laneDeps(), fetchRecording([]));
    const { planner } = wireTurnPlanner(plannerDeps(), reads);
    const { collector } = planner as unknown as {
      collector: TurnPlanCollector;
    };

    expect(TURN_PLAN_TOOLS.map((tool) => tool.tool)).toEqual(
      expect.arrayContaining([SEE_SHELF_TOOL, SEE_STATE_TOOL]),
    );
    const seen = await collector.dispatch({
      tool: SEE_SHELF_TOOL,
      server: "buyer",
      args: {},
    });
    expect(seen.isError).toBe(false);
    expect(JSON.parse(seen.content)).toMatchObject({ merchant: "kolam-run" });
  });
});
