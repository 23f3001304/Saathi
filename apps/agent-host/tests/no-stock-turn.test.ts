// What a turn does when the shop stocks nothing the shopper asked for: it says
// so, it looks somewhere that might, and it signs nothing on the way.
import type { TurnPlan } from "@covenant/agents";
import { beforeEach, describe, expect, it } from "vitest";

import { BeatHub } from "../src/http/beat-hub.js";
import {
  NOT_STOCKED,
  noStockTurn,
  SPOKE_TOO_SOON,
} from "../src/judge/no-stock-step.js";
import type { PurchaseResult } from "../src/purchase/purchase-result.js";
import { emptyResult } from "../src/purchase/purchase-result.js";
import { RecordingLogger, StepClock } from "./support/fakes.js";

const SSD = "do you have a 1tb ssd";

class RecordingWebLook {
  readonly asked: string[] = [];
  readonly anchors: readonly string[][] = [];

  look(
    base: PurchaseResult,
    plan: TurnPlan,
    stated: readonly string[] = [],
  ): Promise<PurchaseResult> {
    this.asked.push(plan.query ?? base.request);
    (this.anchors as string[][]).push([...stated]);
    return Promise.resolve({
      ...base,
      status: "answered",
      transcript: ["Amazon lists a 1TB NVMe at 6,499."],
    });
  }
}

let hub: BeatHub;
let webLook: RecordingWebLook;
let base: PurchaseResult;

beforeEach(() => {
  hub = new BeatHub(new StepClock(), new RecordingLogger());
  webLook = new RecordingWebLook();
  base = emptyResult("urn:covenant:run:1", SSD);
});

/** Nothing already on the table and nothing streamed: the plain path, where
 *  the shop cannot serve it and the open web has not been tried yet. */
function bare() {
  return { offered: { live: () => [] }, drafts: null, chat: "cnv_1" };
}

function run(): Promise<PurchaseResult> {
  return noStockTurn(
    { hub, webLook, logger: new RecordingLogger(), ...bare() },
    base,
    SSD,
  );
}

describe("the turn a shop with nothing to sell produces", () => {
  it("says so as a harness statement, not in the agent's own voice", async () => {
    await run();
    const said = hub
      .snapshot()
      .filter((beat) => beat.kind === "message")
      .map((beat) => (beat.kind === "message" ? beat : null));
    expect(said[0]?.text).toBe(NOT_STOCKED);
    expect(said[0]?.variant).toBe("system");
  });

  it("drafts nothing and asks for no signature", async () => {
    await run();
    const kinds = hub.snapshot().map((beat) => beat.kind);
    expect(kinds).not.toContain("intent-draft");
    expect(kinds).not.toContain("signing-required");
    expect(kinds).not.toContain("intent-signed");
  });

  it("looks on the open web for the thing that was actually asked for", async () => {
    await run();
    expect(webLook.asked).toEqual([SSD]);
  });

  it("ends the run answered, not failed", async () => {
    const result = await run();
    expect(result.status).toBe("answered");
    expect(result.failure).toBeNull();
    expect(result.transcript[0]).toBe(NOT_STOCKED);
  });
});

describe("what the errand is told the shopper wrote", () => {
  it("hands over every line they wrote, not just the last one", async () => {
    await noStockTurn(
      { hub, webLook, logger: new RecordingLogger(), ...bare() },
      emptyResult("urn:covenant:run:1", "50,000rs"),
      `${SSD}
50,000rs`,
    );
    expect(webLook.anchors[0]).toEqual([SSD, "50,000rs"]);
  });
});

const FOUND = {
  ref: "w3",
  title: "Crucial E100 1TB Portable SSD",
  price_text: "₹15,999",
  price_paise: 1_599_900,
  url: "https://www.amazon.in/CRUCIAL-E100/dp/B0D1XYZ123",
  image_url: null,
};

function withCards() {
  const drafts = { withdrawn: [] as string[] };
  return {
    hub,
    webLook,
    logger: new RecordingLogger(),
    chat: "cnv_1",
    offered: { live: () => [FOUND] },
    drafts: {
      withdrawLast: (reason: string) => drafts.withdrawn.push(reason),
    },
    withdrawn: drafts.withdrawn,
  };
}

describe("a shop that cannot serve it, when the web already has", () => {
  it("puts the cards back rather than researching from scratch", async () => {
    // Every `draft_intent` on a two-item shelf lands here, so "OK" to an
    // errand's own findings was answered with a fresh errand that wandered off
    // and found nothing. What they asked for was already on their screen.
    const parts = withCards();

    const result = await noStockTurn(parts, base, SSD);

    expect(webLook.anchors).toEqual([]);
    const offered = hub
      .snapshot()
      .flatMap((beat) => (beat.kind === "options" ? beat.options : []));
    expect(offered.map((row) => row.sku)).toEqual(["w3"]);
    expect(result.status).toBe("answered");
  });
});

describe("a sentence the shelf contradicts does not stand", () => {
  it("takes it back off the screen", async () => {
    const parts = withCards();

    await noStockTurn(parts, base, SSD);

    // "Your purchase request is ready for you to review and sign", said before
    // anything had read the shelf, followed by "I have drafted nothing".
    expect(parts.withdrawn).toEqual([SPOKE_TOO_SOON]);
  });
});
